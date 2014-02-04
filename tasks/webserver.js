'use strict';

module.exports = function(grunt) {

  var fs              = require("fs");
  var connect         = require('connect');
  var ph_libutil      = require("phantomizer-libutil");
  var dirlisting      = require("phantomizer-html-dirlisting");
  var http_utils          = ph_libutil.http_utils;
  var phantomizer_helper  = ph_libutil.phantomizer_helper;
  var file_utils          = ph_libutil.file_utils;

  return function(router, optimizer, options, req_logs){
    var paths = options.paths;
    var requirejs_src = options.scripts.requirejs.src;
    var requirejs_baseUrl = options.scripts.requirejs.baseUrl;
    var requirejs_paths = options.scripts.requirejs.paths;

    var app = connect();
    app.use(connect.query())
    app.use(connect.urlencoded())
    if( options.log == true ){
      app.use(connect.logger('dev'))
    }
    app.use(function(req, res, next){

      var request_path = get_request_path( req.originalUrl );

      if(request_path.match(/^\/stryke_b64/) ){
        request_path = request_path.replace( /^\/stryke_b64/, "" );

        var file = file_utils.find_file(paths, request_path);

        if( file ){
          var buf = fs.readFileSync(file).toString('base64');
          var headers = {
            'Content-Type': http_utils.header_content_type(file)
          };
          res.writeHead(200, headers);
          res.end("data:"+headers['Content-Type']+";base64,"+ buf );
        }else{
          next();
        }
      }else{
        next();
      }
    })
// routed request, html only
    app.use(function(req, res, next){
      var request_path = get_request_path( req.originalUrl )
      var headers = {
        'Content-Type': http_utils.header_content_type(request_path)
      };
      var route = router.match(request_path);
      if( route != false && headers["Content-Type"].indexOf("text/") > -1 ){
        var file = file_utils.find_file(paths,route.template);
        if(! file ){
          grunt.log.error("Cannot find the template "+route.template+" for url route "+request_path);
          next();
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
          buf = phantomizer_helper.inject_requirejs(requirejs_baseUrl, requirejs_src, requirejs_paths, buf, null);
          buf = add_stryke(buf);
          res.writeHead(200, headers);
          res.end(buf);
        }
      }else{
        next();
      }
    })
// various asset including text / binary
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
        res.writeHead(200, headers);
        res.end(buf);
      }else{
        next();
      }
    })
// directory listing
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
      res.writeHead(404, headers);
      res.end("not found");
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
}