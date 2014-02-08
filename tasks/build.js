'use strict';

module.exports = function(grunt) {

  var childProcess    = require('child_process');
  var phantomjs       = require('phantomjs');
  var ph_libutil      = require("phantomizer-libutil");
  var fs              = require("fs");
  var http            = require('http');
  var path            = require('path');

  var meta_factory = ph_libutil.meta;

  var router_factory      = ph_libutil.router;
  var file_utils          = ph_libutil.file_utils;
  var optimizer_factory   = ph_libutil.optimizer;
  var webserver_factory = ph_libutil.webserver;

  grunt.registerMultiTask("phantomizer-strykejs-builder", "Builds html dependencies of a stryke file", function () {

    var wd = process.cwd();

    var config = grunt.config();
    var options = this.options({
      in_request:null,
      port:null,
      ssl_port:null,
      out_file:null,
      paths:null,
      meta_file:null,
      meta_dir:null,
      scripts:null,
      css:null,
      log:false
    });
    var in_request  = options.in_request;
    var port        = options.port;
    var ssl_port    = options.ssl_port;
    var out_file    = options.out;
    var paths       = options.paths;
    var meta_file   = options.meta;
    var meta_dir    = options.meta_dir;

    var current_grunt_task = this.nameArgs;
    var current_grunt_opt = this.options();
    var user_config = grunt.config();

    var meta_manager = new meta_factory( wd, meta_dir );
    var optimizer = new optimizer_factory(meta_manager, config, grunt);
    var router = new router_factory(user_config.routing);

    var done = this.async();
    router.load(function(){
      // check if a cache entry exists, if it is fresh, just serve it
      if( meta_manager.is_fresh(meta_file) == false ){

        // starts a new phantomizer webserver
        var webserver = new webserver_factory(router,optimizer,meta_manager,grunt, options.paths);
        webserver.is_in_build_process(true);
        webserver.enable_query_logs(true);
        webserver.is_phantom(false);
        webserver.enable_dashboard(false);
        webserver.enable_build(false);
        webserver.enable_assets_inject(true);
        webserver.start(options.port, options.ssl_port);

        var finish = function(res){
          if( res == true ){
            grunt.log.ok();
            webserver.stop(function(){
              done(true);
            });
          }else{
            grunt.log.error(res);
            webserver.stop(function(){
              done(false);
            });
          }
        }

        var deps = []
        var route = router.match(in_request);
        var file = file_utils.find_file(paths,route.template);
        deps.push(file);

        var target_url = "http://localhost:"+port+in_request;
        var wrapper = __dirname+'/../ext/phantomjs-stryke-wrapper.js';
        execute_phantomjs([wrapper, target_url, out_file],function(err, stdout, stderr){
          var req_logs = webserver.get_query_logs();
          webserver.clear_query_logs();


          var retour = grunt.file.read(out_file);
// remove stryke configuration used to prevent full execution of the page
          retour = remove_stryke( retour );
// remove requirejs scripts, they are put in the head on runtime
          retour = remove_rjs_trace( retour );
// get traced url call from runtime, remove it from output
          var trace = extract_stryke_trace( retour )
          retour = remove_stryke_trace( retour )
          if( trace.length > 0 ){
            trace.unshift(in_request)
            for(var n in trace){
              deps.push(req_logs[trace[n]])
            }
          }
          // add grunt file to dependencies so that file are rebuild when this file changes
          deps.push(__filename)
          if ( grunt.file.exists(process.cwd()+"/Gruntfile.js")) {
            deps.push(process.cwd()+"/Gruntfile.js")
          }
          if ( grunt.file.exists(user_config.project_dir+"/../config.json")) {
            deps.push( user_config.project_dir+"/../config.json")
          }
          // create a cache entry, so that later we can regen or check freshness
          var entry = meta_manager.create(deps)
          entry.require_task(current_grunt_task, current_grunt_opt)
          entry.save(meta_file, function(err){
            if (err) finish(err)
            else{
              grunt.file.write(out_file, retour)
              finish(true)
            }
          })
        }).stdout.on('data', function (data) {
            console.log(data.trim())
          });
      }else{
        grunt.log.ok("the build is fresh")
        done(true);
      }
    });
  });


  var ProgressBar = require('../node_modules/progress/index.js');

  grunt.registerMultiTask("phantomizer-strykejs-project-builder", "Builds html dependencies of a stryke file", function () {

    var wd = process.cwd();

    var config = grunt.config();
    var options = this.options({
      run_dir:'',
      meta_dir:'',
      port:'',
      ssl_port:'',
      urls_file:'',
      paths:[],
      scripts:null,
      css:null,
      concurrent_request:20,
      log:false
    });
    var run_dir     = options.run_dir;
    var meta_dir    = options.meta_dir;
    var port        = options.port;
    var ssl_port    = options.ssl_port;
    var urls_file   = options.urls_file;

    var paths = options.paths;

    var current_grunt_target = this.target;
    var user_config = grunt.config();

    var meta_manager = new meta_factory( wd, meta_dir );
    var optimizer = new optimizer_factory(meta_manager, config, grunt);
    var router = new router_factory(config.routing);

    // starts a new phantomizer webserver
    var webserver = new webserver_factory(router,optimizer,meta_manager,grunt, options.paths);
    webserver.is_in_build_process(true);
    webserver.enable_query_logs(true);
    webserver.is_phantom(false);
    webserver.enable_dashboard(false);
    webserver.enable_build(false);
    webserver.enable_assets_inject(true);

    var done = this.async();

    // fetch urls to build
    var raw_urls = grunt.file.readJSON(urls_file);

    if( raw_urls.length == 0 ){
      done(true);
      return;
    }

// initialize a progress bar
    var bar = new ProgressBar(' done=[:current/:total] elapsed=[:elapseds] sprint=[:percent] eta=[:etas] [:bar]', {
      complete: '#'
      , incomplete: '-'
      , width: 80
      , total: raw_urls.length
    });


    router.load(function(){

      var finish = function(res){
        if( res == true ){
          grunt.log.ok();
          webserver.stop(function(){
            done(true);
          });
        }else{
          grunt.log.error(res);
          webserver.stop(function(){
            done(false);
          });
        }
      }

      grunt.log.ok("URL Count "+raw_urls.length);

      var strykejs_urls_file = run_dir+"/tmp/strykejs-urls.json";
      grunt.file.mkdir( path.dirname(strykejs_urls_file) )
      for( var n in raw_urls ){
        raw_urls[n].in_request = "http://localhost:"+port+raw_urls[n].in_request+"";
      }
      grunt.file.write(strykejs_urls_file, JSON.stringify(raw_urls));

      webserver.start(options.port, options.ssl_port);
      var wrapper = __dirname+'/../ext/phantomjs-stryke-wrapper2.js';
      var phantomjsprocess = execute_phantomjs([wrapper, strykejs_urls_file, options.concurrent_request], function(err, stdout, stderr){
        var req_logs = webserver.get_query_logs();
        webserver.clear_query_logs();

        grunt.file.delete(strykejs_urls_file);
        //-
        for( var n in raw_urls ){
          var in_request = raw_urls[n].in_request;
          var meta_file = raw_urls[n].meta_file;
          var out_file = raw_urls[n].out_file;
          var deps = [];

          var retour = grunt.file.read(out_file);
          // remove stryke configuration used to prevent full execution of the page
          retour = remove_stryke( retour );
          // remove requirejs scripts, they are put in the head on runtime
          retour = remove_rjs_trace( retour );
          // get traced url call from runtime, remove it from output
          var trace = extract_stryke_trace( retour )
          retour = remove_stryke_trace( retour )
          if( trace.length > 0 ){
            trace.unshift(in_request);
            for(var n in trace){
              deps.push(req_logs[trace[n]]);
            }
          }

          // add grunt file to dependencies so that file are rebuild when this file changes
          deps.push(__filename)
          if ( grunt.file.exists(process.cwd()+"/Gruntfile.js")) {
            deps.push(process.cwd()+"/Gruntfile.js")
          }
          if ( grunt.file.exists(user_config.project_dir+"/../config.json")) {
            deps.push( user_config.project_dir+"/../config.json")
          }
          var route = router.match(in_request);
          if( route != false ){
            var file = file_utils.find_file(paths,route.template);
            deps.push(file);
          }
          // create a cache entry, so that later we can regen or check freshness
          var entry = meta_manager.create(deps);

          // save phantomizer-strykejs-project-builder task options
          var opt = grunt.config.get("phantomizer-strykejs-project-builder");
          if(!opt[current_grunt_target]) opt[current_grunt_target] = {};
          if(!opt[current_grunt_target].options) opt[current_grunt_target].options = {};
          opt[current_grunt_target].options.url = in_request;
          entry.require_task("phantomizer-strykejs-project-builder:"+current_grunt_target, opt[current_grunt_target]);

          entry.save(meta_file, function(err){
            grunt.file.write(out_file, retour);
          })
        }
        finish(true)
      });
      phantomjsprocess.stdout
        .on('data', function (data) {
          data = data.trim();
          grunt.verbose.writeln(data);
        })
        // having some difficulties to pass phantomjs errors to stderr,
        // so listens to stdout for errors
        .on('data', function (data) {
          data = data.trim();
          if( data.match(/^(ERROR: )/) ){
            grunt.log.writeln("\n"+data);
          }
        })
        // update progress bar
        .on('data', function (data) {
          data = data.trim();
          var matches = data.match(/evaluate (done|failed)/);
          if( matches && matches.length ){
            for( var ii=1;ii<matches.length;ii++ ){
              bar.tick();
              grunt.verbose.write("\n");
            }
          }
        })
      ;

    });
  });


  function execute_phantomjs(args, cb){
    var childArgs = [ '--load-images=false' ];
    for(var n in args )childArgs.push(args[n])

    grunt.verbose.writeln(phantomjs.path+" "+childArgs.join(" "));

    grunt.log.ok("Starting PhantomJS... ");
    return childProcess.execFile(phantomjs.path, childArgs, function(err, stdout, stderr) {
      grunt.log.ok("... Done PhantomJS");
      if( stderr != "" ){
        console.error(stderr)
        grunt.log.error("... PhantomJS failed");
      }
      cb(err, stdout, stderr);
    });
  }




  function remove_stryke( in_str ){
    var stryke = "";
    stryke = stryke+"<script>";
    stryke = stryke+    "var phantomatic = true;";
    stryke = stryke+"</script>";
    in_str = in_str.replace(stryke+"", "")
    return in_str
  }
  function remove_rjs_trace( in_str ){
    var ptn = /<script type="text\/javascript" charset="utf-8" async="" data-requirecontext="_"[^>]*><\/script>/g
    in_str = in_str.replace(ptn,"");
    return in_str
  }
  function extract_stryke_trace( in_str ){
    var ptn = /<div id="stryke_trace">([^<]*?)<\/div>/gi
    var retour = []
    var trace = in_str.match(ptn);
    if( trace != null && trace.length > 0 ){
      trace=trace[0];
      trace=trace.substring( ('<div id="stryke_trace">').length );
      trace=trace.substring( 0, trace.length-('</div>').length );
      trace=trace.split(/\r\n|\r|\n/);
      retour = trace;
    }
    return retour
  }
  function remove_stryke_trace( in_str ){
    var ptn = /<div id="stryke_trace">([^<]*?)<\/div>/gi
    var trace=in_str.match(ptn);
    if( trace != null && trace.length > 0 ){
      in_str = in_str.replace(trace[0],"")
    }
    return in_str
  }
};