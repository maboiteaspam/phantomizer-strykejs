
module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    docco: {
      debug: {
        src: [
          'tasks/build.js'
        ],
        options: {
          layout:'linear',
          output: 'documentation/'
        }
      }
    },
    'gh-pages': {
      options: {
        base: '.',
        add: true
      },
      src: ['documentation/**']
    },
    release: {
      options: {
        npm: false, //default: true
        // true will apply the version number as the tag
        npmtag: true, //default: no tag
        tagName: '<%= version %>', //default: '<%= version %>'
        github: {
          repo: 'maboiteaspam/phantomizer-strykejs', //put your user/repo here
          usernameVar: 'GITHUB_USERNAME', //ENVIRONMENT VARIABLE that contains Github username
          passwordVar: 'GITHUB_PASSWORD' //ENVIRONMENT VARIABLE that contains Github password
        }
      }
    }
  });
  grunt.loadNpmTasks('grunt-docco');
  grunt.loadNpmTasks('grunt-gh-pages');
  grunt.loadNpmTasks('grunt-release');

  grunt.registerTask('cleanup-grunt-temp', [],function(){
    var wrench = require('wrench');
    wrench.rmdirSyncRecursive(__dirname + '/.grunt', !true);
    wrench.rmdirSyncRecursive(__dirname + '/documentation', !true);
  });

  // to generate and publish the docco style documentation
  // execute this
  // grunt
  grunt.registerTask('default', ['release:patch','docco','gh-pages', 'cleanup-grunt-temp']);

  // to release the project in a new version
  // use one of those commands
  // grunt --no-write -v release # test only
  // grunt release:patch
  // grunt release:minor
  // grunt release:major
  // grunt release:prerelease

};
