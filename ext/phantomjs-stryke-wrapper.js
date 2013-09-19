
var page = require("webpage").create();
system = require("system");
var target_url = system.args[1];
var out_file = system.args[2];
var iff = 0;

page.open(target_url, function (b) {
    "success" !== b ? (console.log("Unable to access network"), phantom.exit()) : window.setInterval(function () {
        var a = page.evaluate(function (c) {
            var a = document.getElementsByTagName("html")[0].getAttribute("class");
            if (a) {
                if (-1 == a.indexOf("stryked"))return""
            }
            return document.getElementsByTagName("html")[0].innerHTML
        });
        if(iff > 10){
            console.warn("failed to read "+target_url), phantom.exit(1)
        }else if("" != a){
            console.log("")
            console.log("")
            console.log("//-----------//")
            console.log(page.content), phantom.exit(0)
            // console.log(a), phantom.exit(0)
        }
        iff++
    }, 200)
});

