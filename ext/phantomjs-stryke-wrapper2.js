'use strict';

var fs = require('fs');
var system = require("system");
var webpage = require("webpage");

// the JSON urls to fetch and write
var in_urls_file = system.args[1];
var data = fs.read(in_urls_file).toString();
var target_urls = JSON.parse(data);

var concurrent_request = parseInt(system.args[2]);
// fetches url with 20 concurrent requests
iterate(0,concurrent_request,end_iterate,0);


function end_iterate(offset,limit,results,cnt_success){
  console.log("done from:"+(offset-limit)+" to:"+offset+" success:"+cnt_success);
  if( results == false ){
    console.log('\ncomplete\n');
    phantom.exit(0);
  }else{
    var index = offset-limit;
    for( var n in results ){
      var out_file = results[n].url_data.out_file;
      var c = results[n].content;
      fs.write(out_file, c, 'w');
      index++;
    }
    iterate(offset,limit,end_iterate,cnt_success);
  }
}
function iterate(offset,limit,cb,cnt_success){
  var done = 0;
  var results = [];

  if( target_urls.length == 0 ){
    if( cb ) cb(offset,limit,false,cnt_success);
  }
  limit = limit<target_urls.length?limit:target_urls.length;

  for(var n=0;n<limit;n++){
    (function(url_data){
      retrieve_page(url_data.in_request,function(success,url,content){
        done++;
        offset++;
        success?cnt_success++:success;
        results.push({
          url_data:url_data,
          url:url,
          content:content,
          success:success
        });
        // var p = target_url.substring(target_url.lastIndexOf("/")+1);
        // fs.write("results/page"+index+".html", content, 'w');
        if( done == limit ){
          if( cb ) cb(offset,limit,results,cnt_success);
        }
      });
    })(target_urls.shift());
  }
}

function retrieve_page(target_url, cb){
  var page = webpage.create();

  var has_errors = false;

  page.onLoadStarted = function () {
    console.log('Start loading...'+target_url);
  };

  page.onConsoleMessage = function(msg, lineNum, sourceId) {
    console.log('CONSOLE: ' + msg + ' (from line #' + lineNum + ' in "' + sourceId + '")');
  };


  // monkey patch : https://github.com/ariya/phantomjs/issues/10150#issuecomment-28707859
  console.error = function () {
    require("system").stderr.write(Array.prototype.join.call(arguments, ' ') + '\n');
  };
  page.onError = function(msg, trace) {
    if(!has_errors){
      msg = "\t"+target_url+"\n"+msg;
    }
    var msgStack = ['ERROR: ' + msg];
    if (trace && trace.length) {
      msgStack.push('TRACE:');
      trace.forEach(function(t) {
        msgStack.push(' -> ' + t.file + ': ' + t.line + (t.function ? ' (in function "' + t.function + '")' : ''));
      });
    }
    console.error(msgStack.join('\n'));
    has_errors = true;
  };

  page.onLoadFinished = function (status) {
    console.log('load done...'+target_url);
    var interval = null;
    var evaluate = function(){
      var html_content = page.evaluate(function () {
        var content = "";
        var a = document.getElementsByTagName("html")[0].getAttribute("class");
        if (a && a.indexOf("stryked") != -1 ){
          content = document.getElementsByTagName("html")[0].outerHTML;
        }
        return content;
      });
      if( html_content != "" || has_errors ){
        if( has_errors ){
          console.error('evaluate failed...'+target_url);
        }else{
          console.log('evaluate done...'+target_url);
        }
        cb(has_errors, target_url, html_content);
        page.close();
      }else{
        interval = window.setTimeout(evaluate,10);
      }
    };
    window.setTimeout(evaluate,10);
  };


  console.log('open...'+target_url);
  page.open(target_url, function (b) {
    if( b !== "success"){
      console.error("Unable to access network "+target_url);
    }else{
      page.evaluate(function () {});
    }
  });
}