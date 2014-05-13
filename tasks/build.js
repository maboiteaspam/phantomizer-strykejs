'use strict';

module.exports = function(grunt) {

    var childProcess    = require('child_process');
    var phantomjs       = require('phantomjs');
    var ph_libutil      = require("phantomizer-libutil");
    var fs              = require("fs");
    var http            = require('http');
    var path            = require('path');

    var file_utils          = ph_libutil.file_utils;

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

        var current_grunt_task = this.nameArgs;
        var current_grunt_opt = this.options();


        var done = this.async();
// get phantomizer main instance
        var Phantomizer = ph_libutil.Phantomizer;
        var phantomizer = new Phantomizer(process.cwd(),grunt);
        var meta_manager = phantomizer.get_meta_manager();
        // check if a cache entry exists, if it is fresh, just serve it
        if( meta_manager.is_fresh(meta_file) == false ){
            // starts a new phantomizer webserver
            phantomizer.create_webserver(options.paths,function(webserver){

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
                    }else{
                        grunt.log.error(res);
                    }
                    done(res == true);
                }

                var deps = [];

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
                    // create a cache entry, so that later we can regen or check freshness
                    var entry = meta_manager.create(deps);
                    var route = phantomizer.get_router().match(in_request);
                    var file = file_utils.find_file(paths,route.template);
                    entry.append_dependency( file );
                    entry.append_dependency( __filename );
                    entry.require_task(current_grunt_task, current_grunt_opt);
                    entry.save(meta_file, function(err){
                        webserver.stop(function(){
                            if (err) finish(err)
                            else{
                                grunt.file.write(out_file, retour)
                                finish(true)
                            }
                        });
                    });
                })
                    .stdout.on('data', function (data) {
                        console.log(data.trim())
                    });
            });
        }else{
            grunt.log.ok("the build is fresh")
            done(true);
        }

    });


    var ProgressBar = require('progress');

    grunt.registerMultiTask("phantomizer-strykejs-project-builder", "Builds html dependencies of a stryke file", function () {

        var options = this.options({
            run_dir:'',
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
        var port        = options.port;
        var ssl_port    = options.ssl_port;
        var urls_file   = options.urls_file;

        var paths = options.paths;

        var current_grunt_target = this.target;

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
        var parse_ticks = function(data){
            var lines = data.trim().split("\n");
            for( var n in lines ){
                var l = lines[n];
                var matches = l.match(/evaluate (done|failed)/);
                if( matches && matches.length ){
                    for( var ii=1;ii<matches.length;ii++ ){
                        bar.tick();
                    }
                }
            }
        };

        var finish = function(res){
            if( res == true ){
                grunt.log.ok();
            }else{
                grunt.log.error(res);
            }
            done(res == true);
        };

        grunt.log.ok("URL Count "+raw_urls.length);


// get phantomizer main instance
        var Phantomizer = ph_libutil.Phantomizer;
        var phantomizer = new Phantomizer(process.cwd(),grunt);
        var meta_manager = phantomizer.get_meta_manager();
        phantomizer.create_webserver(options.paths,function(webserver){

            webserver.is_in_build_process(true);
            webserver.enable_query_logs(true);
            webserver.is_phantom(false);
            webserver.enable_dashboard(false);
            webserver.enable_build(false);
            webserver.enable_assets_inject(true);
            webserver.start(options.port, options.ssl_port);



            var fetch_pages = function (host, run_dir, raw_urls, concurrent_request, parse_ticks, then){

                var strykejs_urls_file = run_dir+"/tmp/strykejs-urls.json";
                grunt.file.mkdir( path.dirname(strykejs_urls_file) )
                for( var n in raw_urls ){
                    raw_urls[n].in_request = host+raw_urls[n].in_request+"";
                }
                grunt.file.write(strykejs_urls_file, JSON.stringify(raw_urls));


                var wrapper = __dirname+'/../ext/phantomjs-stryke-wrapper2.js';
                var phantomjsprocess = execute_phantomjs([wrapper, strykejs_urls_file, concurrent_request], function(err, stdout, stderr){

                    var req_logs = webserver.get_query_logs();

                    grunt.file.delete(strykejs_urls_file);
                    //-
                    var n__ = 0;
                    for( var n in raw_urls ){
                        finalize_page(raw_urls[n],req_logs,function(){
                            n__++
                            if( n__ == raw_urls.length ) if( then ) then();
                        });
                    }
                });

                phantomjsprocess.stdout
                    .on('data', function (data) {
                        grunt.verbose.writeln(data.trim());
                    })
                    // update progress bar
                    .on('data', parse_ticks);

                phantomjsprocess.stderr
                    .on('data', function (data) {
                        grunt.log.write("\n");
                        grunt.log.error(""+data.trim());
                    })
                    // update progress bar
                    .on('data', parse_ticks);



            }

            var finalize_page = function(raw_url,req_logs,then){
                var in_request = raw_url.in_request;
                var meta_file = raw_url.meta_file;
                var out_file = raw_url.out_file;

                var retour = grunt.file.read(out_file);
                // remove stryke configuration used to prevent full execution of the page
                retour = remove_stryke( retour );
                // remove requirejs scripts, they are put in the head on runtime
                retour = remove_rjs_trace( retour );
                // get traced url call from runtime, remove it from output
                var trace = extract_stryke_trace( retour );
                retour = remove_stryke_trace( retour );

                // add grunt file to dependencies so that file are rebuild when this file changes
                // create a cache entry, so that later we can regen or check freshness
                var entry = meta_manager.create([]);
                entry.append_dependency( __filename );

                if( trace.length > 0 ){
                    trace.unshift(in_request);
                    for(var nn in trace){
                        entry.append_dependency( req_logs[trace[nn]] );
                    }
                }

                var route = phantomizer.get_router().match(in_request);
                if( route != false ){
                    var file = file_utils.find_file(paths,route.template);
                    entry.append_dependency( file );
                }

                // save phantomizer-strykejs-project-builder task options
                var opt = grunt.config.get("phantomizer-strykejs-project-builder");
                if(!opt[current_grunt_target]) opt[current_grunt_target] = {};
                if(!opt[current_grunt_target].options) opt[current_grunt_target].options = {};
                opt[current_grunt_target].options.url = in_request;
                entry.require_task("phantomizer-strykejs-project-builder:"+current_grunt_target, opt[current_grunt_target]);

                entry.save(meta_file, function(err){
                    grunt.file.write(out_file, retour);
                    if( then ) then();
                });
            }



            var current = 0;
            var by_ = 250;
            function refetch(from){
                fetch_pages("http://localhost:"+port, run_dir, raw_urls.slice(from,from+by_), options.concurrent_request, parse_ticks, function(){
                    from+=by_;
                    if( from < raw_urls.length ){
                        refetch(from)
                    }else{
                        webserver.clear_query_logs();
                        webserver.stop(function(){
                            finish(true);
                        });
                    }
                });
            }
            refetch(current);


        });

    });

    function execute_phantomjs(args, cb){
        var childArgs = [ '--load-images=false' ];
        for(var n in args )childArgs.push(args[n])

        grunt.verbose.writeln(phantomjs.path+" "+childArgs.join(" "));

        grunt.log.ok("Starting PhantomJS... ");
        return childProcess.execFile(phantomjs.path, childArgs, function(err, stdout, stderr) {
            if( stderr != "" ){
                grunt.log.error("... PhantomJS failed");
            }else{
                grunt.log.ok("... PhantomJS succeed");
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