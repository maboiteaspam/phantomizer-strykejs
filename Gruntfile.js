
module.exports = function(grunt) {

    var d = __dirname+"/vendors/phantomizer-strykejs";

    var out_dir = d+"/demo/out/";
    var meta_dir = d+"/demo/out/";


    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json')

        ,"out_dir":out_dir
        ,"meta_dir":meta_dir

        //-
        ,'phantomizer-strykejs-builder': {
            options: {
                "port":8080,
                "ssl_port":8081,
                "paths":[d+"/demo/in/"]
            }
            ,test: {
                options:{
                    "in_request":"/index.html"
                    ,"out": "<%= out_dir %>/index.html"
                    ,"meta": "<%= meta_dir %>/index.html.meta"
                }
            }
        }
    });

    grunt.loadNpmTasks('phantomizer-strykejs');

    grunt.registerTask('default',
        [
            'phantomizer-strykejs-builder:test'
        ]);
};
