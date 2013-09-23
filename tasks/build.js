'use strict';

module.exports = function(grunt) {

    grunt.registerMultiTask("phantomizer-strykejs-builder", "Builds html dependencies of a stryke file", function () {

        var ph_libutil = require("phantomizer-libutil");
        var fs = require("fs");
        var connect = require('connect');
        var http = require('http');

        var childProcess = require('child_process');
        var phantomjs = require('phantomjs');

        var meta_factory = ph_libutil.meta;
        var wd = process.cwd();

        var http_utils = ph_libutil.http_utils;
        var file_utils = ph_libutil.file_utils;
        var optimizer_factory = ph_libutil.optimizer;
        var phantomizer_helper = ph_libutil.phantomizer_helper;


        var options = this.options();
        var in_request = options.in_request;
        var port = options.port;
        var ssl_port = options.ssl_port;
        var out_file = options.out;
        var paths = options.paths;
        var meta_file = options.meta;
        var meta_dir = options.meta_dir;
        var current_grunt_task = this.nameArgs;
        var current_grunt_opt = this.options();

        var meta_manager = new meta_factory( wd, meta_dir );
        var optimizer = new optimizer_factory(meta_manager, options);

        // check if a cache entry exists, if it is fresh, just serve it
        if( meta_manager.is_fresh(meta_file) == false ){

            var req_logs = {}
            var deps = []

            var target_url = "http://localhost:"+port+in_request;


            var app = connect();
            app.use(connect.query())
            app.use(connect.urlencoded())
            if( options.log == true ){
                app.use(connect.logger('dev'))
            }
            app.use(function(req, res, next){
                var request_path = req.originalUrl
                if( request_path.indexOf("?")>-1){
                    request_path = request_path.substring(0,request_path.indexOf("?"))
                }

                var file = file_utils.find_file(paths,request_path);
                if( file != null ){
                    req_logs[request_path] = file

                    var headers = {
                        'Content-Type': http_utils.header_content_type(file)
                    };
                    var buf = null
                    if( headers["Content-Type"].indexOf("text/") > -1 ){
                        buf = fs.readFileSync(file).toString();
                        if( in_request == request_path ){
                            var base_url = request_path.substring(0,request_path.lastIndexOf("/")) || "/";
                            if( options.scripts ){
                                create_combined_assets(options.scripts, paths);
                                buf = phantomizer_helper.apply_scripts(options.scripts, base_url, buf);
                            }
                            if( options.css ){
                                create_combined_assets(options.css, paths);
                                buf = phantomizer_helper.apply_styles(options.css, base_url, buf);
                            }
                            buf = add_stryke(buf);
                        }
                    }else{
                        buf = fs.readFileSync(file)
                    }
                    res.writeHead(200, headers)
                    res.end(buf)
                }else{
                    next()
                }
            })
            app.use(function(req, res, next){
                var request_path = req.originalUrl;
                if( request_path.indexOf("?")>-1){
                    request_path = request_path.substring(0,request_path.indexOf("?"))
                }
                var file = file_utils.find_dir(paths,request_path);
                if( file != null ){
                    var items = http_utils.merged_dirs(paths, request_path);
                    http_utils.generate_directory_listing(items, function(err, html){
                        var headers = {
                            'Content-Type': 'text/html'
                        };
                        res.writeHead(200, headers);
                        res.end(buf);
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

            var wserver = http.createServer(app).listen(port);


            var childArgs = [
                '--load-images=false',
                '--load-images=false',
                __dirname+'/../ext/phantomjs-stryke-wrapper.js',
                target_url
            ]

            var done = this.async();
            var finish = function(res){
                if( res == true ){
                    grunt.log.ok()
                    done(true);
                }else{
                    grunt.log.error(res)
                    done(false);
                }
            }

            grunt.log.ok("Starting PhantomJS... ")
            childProcess.execFile(phantomjs.path, childArgs, function(err, stdout, stderr) {
                grunt.log.ok("... Done PhantomJS")

                wserver.close();

                if( stderr != "" ){
                    finish("phantomjs error\n"+stderr)
                } else {
                    var retour = extract_html(stdout)
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
                }
            })

        }else{
            grunt.log.ok("the build is fresh")
        }


        function extract_html( in_str ){
            var wdlm = "\r\n\r\n//-----------//\r\n"
            var dlm = "\n\n//-----------//\n"
            in_str = in_str.replace(wdlm, dlm)
            in_str = in_str.substring( in_str.indexOf(dlm)+dlm.length )
            return in_str
        }
        function add_stryke( in_str ){
            var stryke = ""
            stryke = stryke+"<script>"
            stryke = stryke+    "var phantomatic = true;"
            stryke = stryke+"</script>"
            in_str = in_str.replace("</head>", stryke+"</head>")
            return in_str
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
            var trace=in_str.match(ptn);
            if( trace != null && trace.length > 0 ){
                trace=trace[0]
                trace=trace.substring( ('<div id="stryke_trace">').length )
                trace=trace.substring( 0, trace.length-('</div>').length )
                trace=trace.split(/\r\n|\r|\n/);
                retour = trace
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

        function create_combined_assets(assets_combination, source_paths){
            if( assets_combination.append ){
                for( var target_merge in assets_combination.append ){
                    if( target_merge.length > 1 ){
                        var asset_deps = assets_combination.append[target_merge];
                        optimizer.merge_files(target_merge, asset_deps, source_paths);
                        grunt.verbose.ok("merged "+target_merge+"")
                    }
                }
            }
            if( assets_combination.prepend ){
                for( var target_merge in assets_combination.prepend ){
                    if( target_merge.length > 1 ){
                        var asset_deps = assets_combination.prepend[target_merge]
                        optimizer.merge_files(target_merge, asset_deps, source_paths);
                        grunt.verbose.ok("merged "+target_merge+"")
                    }
                }
            }
        }
    });
};