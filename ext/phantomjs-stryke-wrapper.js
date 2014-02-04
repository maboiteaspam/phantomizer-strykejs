
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


    page.onLoadStarted = function () {
        console.log('Start loading...'+target_url);
    };

    page.onConsoleMessage = function(msg, lineNum, sourceId) {
        console.log('CONSOLE: ' + msg + ' (from line #' + lineNum + ' in "' + sourceId + '")');
    };

    page.onError = function(msg, trace) {
        var msgStack = ['ERROR: ' + msg];
        if (trace && trace.length) {
            msgStack.push('TRACE:');
            trace.forEach(function(t) {
                msgStack.push(' -> ' + t.file + ': ' + t.line + (t.function ? ' (in function "' + t.function + '")' : ''));
            });
        }
        console.error(msgStack.join('\n'));
    };

  page.onLoadFinished = function (status) {
    console.log('load done...'+target_url);
    var interval = null;
    var evaluate = function(){
      var a = page.evaluate(function (c) {
        var a = document.getElementsByTagName("html")[0].getAttribute("class");
        if (a) {
          if (a.indexOf("stryked") != -1 ){
            return document.getElementsByTagName("html")[0].outerHTML;
          }
        }
        return "";
      });
      if( a != "" ){
        console.log('evaluate done...'+target_url);
        cb(true,target_url, a);
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
            console.log("Unable to access network "+target_url);
        }else{
            page.evaluate(function () {});
        }
    });
}