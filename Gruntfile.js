
module.exports = function(grunt) {

    // test purpose
    var d = __dirname+"/vendors/phantomizer-html-assets";

    var src_dir = d+"/demo/in/";
    var out_dir = d+"/demo/out/";
    var meta_dir = d+"/demo/out/";
    // test purpose


    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json')

        // test purpose
        ,"out_dir":out_dir
        ,"meta_dir":meta_dir

        //-
        ,'phantomizer-html-assets': {
            options: {
                "file_suffix": "-opt"
                ,"in_request": "/some.html"
                ,"out_path": "<%= out_dir %>/"
                ,"meta_path": "<%= meta_dir %>/"
                ,"requirejs_src":"/js/require.js"
                ,"requirejs_baseUrl": "/js/"
                ,"manifest": true
                ,"htmlcompressor": true
                ,"imgcompressor": true
                ,"phantomizer-htmlcompressor":{
                    options: {
                        "compress-js":true
                        ,"compress-css":true
                    }
                }
                ,"phantomizer-uglifyjs":{
                    banner: ''
                    ,beautify: false
                    ,report: false
                }
                ,"phantomizer-requirejs":{
                    "baseUrl": src_dir+"js"
                    ,"paths": {
                        "almond": src_dir+"js/almond-0.2.5"
                        ,"jquery": src_dir+"js/jquery-1.10.2.min"
                    }
                    ,"optimize": "none"
                    ,"wrap": true
                    ,"name": "almond"
                }
                ,"phantomizer-imgopt":{
                    "optimizationLevel": 3
                }
                ,"img_variance":{
                    "\.(png|jpeg|jpg)$":"@2x.$1"
                }
                ,"phantomizer-requirecss":{
                    "optimizeCss": "standard"
                }
                ,"paths":[src_dir]
            }
            ,test: {
                options:{
                    "file_suffix": "-test"
                    ,"in_file": src_dir+"/index.html"
                    ,"out": "<%= out_dir %>/index.html"
                    ,"out_path": "<%= out_dir %>/"
                    ,"meta_path": "<%= meta_dir %>/"
                    ,"meta": "<%= meta_dir %>/index-build.html"
                }
            }
        },
        // test purpose
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
                bump: true,
                add: false,
                commit: false,
                npm: false,
                npmtag: true,
                tagName: '<%= version %>',
                github: {
                    repo: 'maboiteaspam/phantomizer-html-assets',
                    usernameVar: 'GITHUB_USERNAME',
                    passwordVar: 'GITHUB_PASSWORD'
                }
            }
        }
    });

    // test purpose
    grunt.loadNpmTasks('phantomizer-requirejs');
    grunt.loadNpmTasks('phantomizer-htmlcompressor');
    grunt.loadNpmTasks('phantomizer-uglifyjs');
    grunt.loadNpmTasks('phantomizer-html-assets');

    grunt.registerTask('default',
        [
            'phantomizer-html-assets:test'
        ]);
    // test purpose


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
    grunt.registerTask('default', ['docco','gh-pages', 'cleanup-grunt-temp']);

    // to release the project in a new version
    // use one of those commands
    // grunt --no-write -v release # test only
    // grunt release:patch
    // grunt release:minor
    // grunt release:major
    // grunt release:prerelease
};
