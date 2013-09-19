'use strict';

var pahntomizer_webapp = null
module.exports = function(grunt) {

    grunt.registerMultiTask("phantomizer-strykejs-builder", "Builds html dependencies of a stryke file", function () {

        var ph_libutil = require("phantomizer-libutil")
        var fs = require("fs")
        var connect = require('connect')

        var childProcess = require('child_process')
        var phantomjs = require('phantomjs')
        var path = require('path')

        var meta_factory = ph_libutil.meta
        var wd = process.cwd()
        var meta_manager = new meta_factory( wd )

        var http_utils = ph_libutil.http_utils;
        var html_utils = ph_libutil.html_utils;
        var file_utils = ph_libutil.file_utils;


        var options = this.options();
        var in_request = options.in_request;
        var port = options.port;
        var ssl_port = options.ssl_port;
        var out_file = options.out;
        var paths = options.paths;
        var meta_file = options.meta;
        var current_grunt_task = this.nameArgs;
        var current_grunt_opt = this.options();

        // check if a cache entry exists, if it is fresh, just serve it

        if( meta_manager.is_fresh(meta_file) == false ){

            var req_logs = {}
            var deps = []

            var target_url = "http://localhost:"+port+in_request;


            var app = pahntomizer_webapp;
            if( app == null ){
                app = connect()
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

                    var file = file_utils.find_file(paths,request_path)
                    if( file != null ){
                        req_logs[request_path] = file

                        var headers = {
                            'Content-Type': http_utils.header_content_type(file)
                        };
                        var buf = null
                        if( headers["Content-Type"].indexOf("text/") > -1 ){
                            buf = fs.readFileSync(file).toString()
                            if( in_request == request_path ){
                                buf = inject_assets(options, request_path, buf);
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
                    var file = file_utils.find_dir(paths,request_path)
                    if( file != null ){
                        var items = http_utils.merged_dirs(paths, request_path)
                        var buf = ""
                        for(var i in items) {
                            buf += "<a href='"+items[i].path+"'>"+items[i].name+"</a><br/>"
                        }
                        var headers = {
                            'Content-Type': 'text/html'
                        };
                        res.writeHead(200, headers)
                        res.end(buf)
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

                app.listen(port)
            }


            var childArgs = [
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

                app.close();

                if( stderr != "" ){
                    finish("phantomjs error\n"+stderr)
                } else {
                    var retour = extract_html(stdout)
                    // remove stryke configuration used to prevent full execution of the page
                    retour = remove_stryke( retour )
                    // remove requirejs scripts, they are put in the head on runtime
                    retour = remove_rjs_trace( retour )
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

        function inject_assets(options, request_path, html_content){
            // look up for scripts to strip / merge / inject
            var base_url = request_path.substring(0,request_path.lastIndexOf("/")) || "/"

            if( options.scripts ){
                if( options.scripts.append ){
                    for( var target_merge in options.scripts.append ){
                        if( target_merge.length == 1 ){
                            html_content = html_utils.append_script(target_merge, html_content )
                            grunt.verbose.ok("script injected "+target_merge+", append")
                        }
                    }
                }
                if( options.scripts.prepend ){
                    for( var target_merge in options.scripts.prepend ){
                        if( target_merge.length == 1 ){
                            var anchor = html_utils.script_anchor(html_content, base_url)
                            html_content = html_utils.prepend_script(target_merge, html_content, anchor)
                            grunt.verbose.ok("css injected "+target_merge+", prepend")
                        }
                    }
                }
                if( options.scripts.append ){
                    for( var target_merge in options.scripts.append ){
                        if( target_merge.length > 1 ){
                            var asset_deps = options.scripts.append[target_merge]
                            merge_files(target_merge, asset_deps, options.out_dir, options.meta_dir, paths)
                            html_content = html_utils.strip_scripts(asset_deps, html_content, base_url)
                            html_content = html_utils.append_script(target_merge, html_content )
                            grunt.verbose.ok("scripts merged "+target_merge+", append")
                        }
                    }
                }
                if( options.scripts.prepend ){
                    for( var target_merge in options.scripts.prepend ){
                        if( target_merge.length > 1 ){
                            var asset_deps = options.scripts.prepend[target_merge]
                            merge_files(target_merge, asset_deps, options.out_dir, options.meta_dir, paths)
                            html_content = html_utils.strip_scripts(asset_deps, html_content, base_url)
                            var anchor = html_utils.script_anchor(html_content, base_url)
                            html_content = html_utils.prepend_script(target_merge, html_content, anchor)
                            grunt.verbose.ok("css merged "+target_merge+", prepend")
                        }
                    }
                }
                if( options.scripts.strip ){
                    html_content = html_utils.strip_scripts(options.scripts.strip, html_content, base_url )
                    grunt.verbose.ok("scripts striped")
                }
            }
            if( options.css ){
                if( options.css.append ){
                    for( var target_merge in options.css.append ){
                        if( target_merge.length == 1 ){
                            html_content = html_utils.append_css(target_merge, html_content )
                            grunt.log.ok("css injected "+target_merge+", append")
                        }
                    }
                }
                if( options.css.prepend ){
                    for( var target_merge in options.css.prepend ){
                        if( target_merge.length == 1 ){
                            var anchor = html_utils.css_anchor(html_content, base_url)
                            html_content = html_utils.prepend_css(target_merge, html_content, anchor)
                            grunt.log.ok("css injected "+target_merge+", prepend")
                        }
                    }
                }
                if( options.css.append ){
                    for( var target_merge in options.css.append ){
                        if( target_merge.length > 1 ){
                            var asset_deps = options.css.append[target_merge]
                            merge_files(target_merge, asset_deps, options.out_dir, options.meta_dir, paths)
                            html_content = html_utils.strip_css(asset_deps, html_content, base_url)
                            html_content = html_utils.append_css(target_merge, html_content )
                            grunt.verbose.ok("css merged "+target_merge+", append")
                        }
                    }
                }
                if( options.css.prepend ){
                    for( var target_merge in options.css.prepend ){
                        if( target_merge.length > 1 ){
                            var asset_deps = options.css.prepend[target_merge]
                            merge_files(target_merge, asset_deps, options.out_dir, options.meta_dir, paths)
                            html_content = html_utils.strip_css(asset_deps, html_content, base_url)
                            var anchor = html_utils.css_anchor(html_content, base_url)
                            html_content = html_utils.prepend_css(target_merge, html_content, anchor)
                            grunt.verbose.ok("css merged "+target_merge+", prepend")
                        }
                    }
                }
                if( options.css.strip ){
                    html_content = html_utils.strip_css(options.css.strip, html_content, base_url )
                    grunt.verbose.ok("css striped")
                }
            }
            return html_content;
        }

        function merge_files(target_merge, deps, out_path, meta_path, paths, current_grunt_task, current_grunt_opt){
            var MetaManager = new meta_factory( process.cwd() )

            var entry_path = meta_path+target_merge+".meta";
            var target_path = out_path+target_merge+"";
            if(MetaManager.is_fresh(entry_path) == false ){
                // materials required to create cache entry
                var entry = MetaManager.create([])


                if ( grunt.file.exists(process.cwd()+"/Gruntfile.js")) {
                    entry.load_dependencies([process.cwd()+"/Gruntfile.js"])
                }
                entry.load_dependencies([target_path])

                var merge_content = ""
                for( var n in deps ){
                    var file_dep = file_utils.find_file(paths, deps[n])
                    if( file_dep != false ){
                        merge_content += grunt.file.read(file_dep)
                        entry.load_dependencies([file_dep])
                    }
                }
                grunt.file.write(target_path, merge_content)

                // create a cache entry, so that later we can regen or check freshness
                entry.require_task(current_grunt_task, current_grunt_opt)
                entry.save(entry_path)
            }

        }

    });
};