
system = require("system");
fs = require("fs");
var target_url = system.args[1];
var out_file = system.args[2];

retrieve_page(target_url, function(success,url,content){
  fs.write(out_file, content, 'w');
  phantom.exit(0);
});
function retrieve_page(target_url, cb){
  var page = require("webpage").create();

  var has_errors = false;


  page.onLoadStarted = function () {
    console.log('Start loading...'+target_url);
  };

  page.onConsoleMessage = function(msg, lineNum, sourceId) {
    msg = 'CONSOLE: ' + msg + ' (from line #' + lineNum + ' in "' + sourceId + '")';
    console.log(msg);
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
          console.log('evaluate failed...'+target_url);
        }else{
          console.log('evaluate done...'+target_url);
        }
        cb(has_errors,target_url, html_content);
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