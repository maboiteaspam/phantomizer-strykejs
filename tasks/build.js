'use strict';

module.exports = function(grunt) {

    var childProcess    = require('child_process');
    var phantomjs       = require('phantomjs');
    var ph_libutil      = require("phantomizer-libutil");
    var dirlisting      = require("phantomizer-html-dirlisting");
    var fs              = require("fs");
    var connect         = require('connect');
    var http            = require('http');

    var meta_factory = ph_libutil.meta;

    var http_utils          = ph_libutil.http_utils;
    var router_factory      = ph_libutil.router;
    var file_utils          = ph_libutil.file_utils;
    var optimizer_factory   = ph_libutil.optimizer;
    var phantomizer_helper  = ph_libutil.phantomizer_helper;

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
        var optimizer = new optimizer_factory(meta_manager, config);
        var router = new router_factory(user_config.routing);

        var done = this.async();
        router.load(function(){
            // check if a cache entry exists, if it is fresh, just serve it
            if( meta_manager.is_fresh(meta_file) == false ){

                var req_logs = {}
                var app = get_webserver(router, optimizer, options, req_logs);
                var wserver = http.createServer(app).listen(port);

                var finish = function(res){
                    // return;
                    if( res == true ){
                        grunt.log.ok()
                        done(true);
                    }else{
                        grunt.log.error(res)
                        done(false);
                    }
                }

                var deps = []
                var route = router.match(in_request);
                var file = file_utils.find_file(paths,route.template);
                deps.push(file);

                var target_url = "http://localhost:"+port+in_request;
                var wrapper = __dirname+'/../ext/phantomjs-stryke-wrapper.js';
                execute_phantomjs([wrapper, target_url, out_file],function(err, stdout, stderr){
                    wserver.close();


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



    grunt.registerMultiTask("phantomizer-strykejs-builder2", "Builds html dependencies of a stryke file", function () {

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
        var optimizer = new optimizer_factory(meta_manager, config);
        var router = new router_factory(config.routing);

        var req_logs = {}
        var app = get_webserver(router, optimizer, options, req_logs);
        var wserver = http.createServer(app).listen(port);
        var wsserver = http.createServer(app).listen(ssl_port);

        var done = this.async();
        router.load(function(){

            var finish = function(res){
                // return;
                if( res == true ){
                    grunt.log.ok()
                    done(true);
                }else{
                    grunt.log.error(res)
                    done(false);
                }
            }

            var raw_urls = grunt.file.readJSON(urls_file);
            urls_file = run_dir+"tmp/phantomjs-urls.json";
            grunt.file.mkdir(run_dir+"tmp")
            for( var n in raw_urls ){
                raw_urls[n].in_request = "http://localhost:"+port+raw_urls[n].in_request+"";
            }
            grunt.file.write(urls_file, JSON.stringify(raw_urls));

            var wrapper = __dirname+'/../ext/phantomjs-stryke-wrapper2.js';
            execute_phantomjs([wrapper, urls_file], function(err, stdout, stderr){
                wserver.close();
                wsserver.close();

                // console.log(stdout)

                //-
                var urls = grunt.file.readJSON(urls_file);
                for( var n in urls ){
                    var in_request = urls[n].in_request;
                    var meta_file = urls[n].meta_file;
                    var out_file = urls[n].out_file;
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
                    var route = router.match(in_request);
                    if( route != false ){
                        var file = file_utils.find_file(paths,route.template);
                        deps.push(file);
                    }
                    // create a cache entry, so that later we can regen or check freshness
                    var entry = meta_manager.create(deps);

                    var opt = grunt.config.get("phantomizer-html-builder2");
                    if(!opt[current_grunt_target]) opt[current_grunt_target] = {};
                    if(!opt[current_grunt_target].options) opt[current_grunt_target].options = {};
                    opt[current_grunt_target].options.url = in_request;
                    entry.require_task("phantomizer-build2:"+current_grunt_target, opt[current_grunt_target]); // why re send to phantomizer-build2 ?

                    entry.save(meta_file, function(err){
                        grunt.file.write(out_file, retour)
                    })
                }
                finish(true)
            }).stdout.on('data', function (data) {
                console.log(data.trim())
            });

        });
    });


    function get_webserver(router, optimizer, options, req_logs){
        var paths = options.paths;

        var app = connect();
        app.use(connect.query())
        app.use(connect.urlencoded())
        if( options.log == true ){
            app.use(connect.logger('dev'))
        }
        app.use(function(req, res, next){

            var request_path = get_request_path( req.originalUrl )

            if(request_path.match(/^\/stryke_b64/) ){
                request_path = request_path.replace( /^\/stryke_b64/, "" );

                var file = file_utils.find_file(paths, request_path);

                if( file ){
                    var buf = fs.readFileSync(file).toString('base64');
                    var headers = {
                        'Content-Type': http_utils.header_content_type(file)
                    };
                    res.writeHead(200, headers)
                    res.end("data:"+headers['Content-Type']+";base64,"+ buf )
                }else{
                    next()
                }
            }else{
                next()
            }
        })
        app.use(function(req, res, next){
            var request_path = get_request_path( req.originalUrl )
            var headers = {
                'Content-Type': http_utils.header_content_type(request_path)
            };
            var route = router.match(request_path);
            if( route != false && headers["Content-Type"].indexOf("text/") > -1 ){
                var file = file_utils.find_file(paths,route.template);
                if(! file ){
                    grunt.log.error("found invalid route in your configuration file "+request_path);
                    next()
                }else{
                    req_logs[request_path] = file;
                    var buf = fs.readFileSync(file);
                    if( headers["Content-Type"].indexOf("text/") > -1 ){
                        buf = buf.toString();
                    }
                    var base_url = request_path.substring(0,request_path.lastIndexOf("/")) || "/";
                    if( options.scripts ){
                        create_combined_assets(optimizer, options.scripts, paths);
                        buf = phantomizer_helper.apply_scripts(options.scripts, base_url, buf);
                    }
                    if( options.css ){
                        create_combined_assets(optimizer, options.css, paths);
                        buf = phantomizer_helper.apply_styles(options.css, base_url, buf);
                    }
                    buf = add_stryke(buf);
                    res.writeHead(200, headers)
                    res.end(buf)
                }
            }else{
                next()
            }
        })
        app.use(function(req, res, next){
            var request_path = get_request_path( req.originalUrl )
            var headers = {
                'Content-Type': http_utils.header_content_type(request_path)
            };
            var file = file_utils.find_file(paths,request_path);
            if( file ){
                req_logs[request_path] = file;
                var buf = fs.readFileSync(file);
                if( headers["Content-Type"].indexOf("text/") > -1 ){
                    buf = buf.toString();
                }
                res.writeHead(200, headers)
                res.end(buf)
            }else{
                next()
            }
        })
        app.use(function(req, res, next){
            var request_path = get_request_path( req.originalUrl )
            var file = file_utils.find_dir(paths,request_path);
            if( file != null ){
                var items = http_utils.merged_dirs(paths, request_path);
                dirlisting.generate_directory_listing(items, function(err, html){
                    var headers = {
                        'Content-Type': 'text/html'
                    };
                    res.writeHead(200, headers);
                    res.end(html);
                });
            }else{
                next()
            }
        })
        app.use(function(req, res){
            var headers = {
                'Content-Type': 'text/html'
            };
            res.writeHead(404, headers)
            res.end("not found")
        })

        return app;
    }
    function get_request_path( request_path ){
        if( request_path.indexOf("?")>-1){
            request_path = request_path.substring(0,request_path.indexOf("?"))
        }
        return request_path
    }
    function add_stryke( in_str ){
        var stryke = ""
        stryke = stryke+"<script>"
        stryke = stryke+    "var phantomatic = true;"
        stryke = stryke+"</script>"
        in_str = in_str.replace("</head>", stryke+"</head>")
        return in_str
    }
    function create_combined_assets(optimizer, assets_combination, source_paths){
        var target_merge="";
        if( assets_combination.append ){
            for( target_merge in assets_combination.append ){
                if( target_merge.length > 1 ){
                    var asset_deps = assets_combination.append[target_merge];
                    optimizer.merge_files(target_merge, asset_deps, source_paths);
                    grunt.verbose.ok("merged "+target_merge+"")
                }
            }
        }
        if( assets_combination.prepend ){
            for( target_merge in assets_combination.prepend ){
                if( target_merge.length > 1 ){
                    var asset_deps = assets_combination.prepend[target_merge];
                    optimizer.merge_files(target_merge, asset_deps, source_paths);
                    grunt.verbose.ok("merged "+target_merge+"")
                }
            }
        }
    }
    function execute_phantomjs(args, cb){
        var childArgs = [ '--load-images=false' ];
        for(var n in args )childArgs.push(args[n])

        grunt.verbose.writeln(phantomjs.path+" "+childArgs.join(" "));

        grunt.log.ok("Starting PhantomJS... ");
        return childProcess.execFile(phantomjs.path, childArgs, function(err, stdout, stderr) {
            grunt.log.ok("... Done PhantomJS");
            if( stderr != "" ){
                console.log(stderr)
                grunt.log.error("... PhantomJS failed");
            }
            cb(err, stdout, stderr);
        });
    }




    function remove_stryke( in_str ){
        var stryke = ""
        stryke = stryke+"<script>"
        stryke = stryke+    "var phantomatic = true;"
        stryke = stryke+"</script>"
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
            trace=trace[0]
            trace=trace.substring( ('<div id="stryke_trace">').length )
            trace=trace.substring( 0, trace.length-('</div>').length )
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