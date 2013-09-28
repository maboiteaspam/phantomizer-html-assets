'use strict';

module.exports = function(grunt) {

    grunt.registerMultiTask("phantomizer-html-assets", "Builds assets within an html file", function () {

        var _ = grunt.util._;
        var path = require('path');

        var ph_libutil = require("phantomizer-libutil");
        var meta_factory = ph_libutil.meta;
        var html_utils = ph_libutil.html_utils;

        var options = this.options();
        grunt.verbose.writeflags(options,"options");

        var meta_file = options.meta_file;
        var in_file = options.in_file;
        var out_file = options.out;
        var meta_dir = options.meta_dir;
        var out_path = options.out_path;
        var paths = options.paths;
        var manifest = options.manifest || false;
        var requirejs_src = options.requirejs_src || false;
        if( requirejs_src.substring ) requirejs_src = [requirejs_src];
        var uglify_js = options.uglify_js || false;
        var htmlcompressor = options.htmlcompressor || false;
        var imgcompressor = options.imgcompressor || false;
        var image_merge = options.image_merge || false;
        var file_suffix = !options.file_suffix? "-opt" :""+options.file_suffix;
        var in_request = options.in_request || "/";
        var base_url = path.dirname(in_request);
        var deps = [];
        var sub_tasks = [];

        var meta_manager = new meta_factory( process.cwd(), meta_dir );

        var current_grunt_task  = this.nameArgs;
        var current_target      = this.target;
        var current_grunt_opt   = this.options();

        if( meta_manager.is_fresh(meta_file) == false ){

            deps.push(in_file)

            if ( grunt.file.exists(process.cwd()+"/Gruntfile.js")) {
                deps.push(process.cwd()+"/Gruntfile.js")
            }
            deps.push(in_file)

            var html_content = grunt.file.read(in_file).toString()

            /*
            NOTES that this code should be optimized in the future
                the html_content is parsed again and again too many times
                a better model would use an object as a list of reference to html nodes of the document,
                    something like DOM
                each node reference could be updated in place,
                removed from the list and deleted from the content
                added in place
                ect
                wihtout having to parse the html string on every changes
            */

            // look up for scripts to strip / merge / inject

            html_content = html_clean_css(html_content)
            grunt.log.ok("html cleaned")



            if( image_merge ){
                queue_img_merge(sub_tasks, current_target )
            }

            // given a list of nodes, identify and merge those which has a corresponding file on drive
            var ForEachNodeFileFound = function( nodes, paths, cb ){
                for( var n in nodes ){
                    if( nodes[n].has_domain == false ){
                        var in_file = nodes[n].asrc
                        var _in_file = find_in_paths(paths,in_file)
                        if( _in_file != false ){
                            in_file = _in_file
                            cb(n, nodes[n], in_file)
                        }
                    }
                }
            };
            // given a list of nodes, searches for those which holds css reference
            var ForEachRuleFileFound = function( nodes, paths, cb ){
                for( var n in nodes ){
                    for( var k in nodes[n].imports ){
                        var import_rule = nodes[n].imports[k]
                        if( import_rule.has_domain == false ){
                            var in_file = import_rule.asrc
                            var _in_file = find_in_paths(paths,in_file)
                            if( _in_file != false ){
                                in_file = _in_file
                                cb(n, nodes[n], k, import_rule, in_file)
                            }
                        }
                    }
                }
            };
            // given a list of nodes, searches for those which are css nodes, and that has img 
            var ForEachImageFileFound = function( nodes, paths, cb ){
                for( var n in nodes ){
                    for( var k in nodes[n].imgs ){
                        var import_img = nodes[n].imgs[k]
                        if( import_img.has_domain == false ){
                            var in_file = import_img.asrc
                            var _in_file = find_in_paths(paths,in_file)
                            if( _in_file != false ){
                                in_file = _in_file
                                cb(n, nodes[n], k, import_img, in_file)
                            }
                        }
                    }
                }
            }

            // look up for css file to compile
            // <link rel="stylesheet" href="?">
            var lnodes = html_utils.find_link_nodes(html_content, base_url)
            ForEachNodeFileFound(lnodes, paths, function(n, node, in_file){
                deps.push(in_file)
                var osrc = node.src.replace(".css",file_suffix+".css")
                queue_css_build(sub_tasks, current_target, out_path+osrc, osrc+".meta", in_file)

                if( image_merge ){
                    var tsrc = osrc.replace(file_suffix+".css", ".css")
                    tsrc = tsrc.replace(".css", "-im"+file_suffix+".css")
                    queue_css_img_merge( sub_tasks, current_target, out_path, meta_dir, osrc, tsrc, paths )
                    osrc = tsrc
                }

                html_content = html_content.replace(node.node, node.node.replace(node.src, osrc) )
            })
            grunt.log.ok("css built")

            // look up for <style> nodes
            var snodes = html_utils.find_style_nodes(html_content, base_url)
            ForEachRuleFileFound(snodes, paths, function(n, node, k, rule, in_file){
                deps.push(in_file)
                var osrc = rule.src.replace(".css",file_suffix+".css");
                queue_css_build(sub_tasks, current_target, out_path+osrc, osrc+".meta", in_file)

                if( image_merge ){
                    var tsrc = osrc.replace(file_suffix+".css", ".css")
                    tsrc = tsrc.replace(".css", "-im"+file_suffix+".css")
                    queue_css_img_merge( sub_tasks, current_target, out_path, meta_dir, osrc, tsrc, paths )
                    osrc = tsrc
                }

                var node_ = node.node.replace(rule.src, osrc)
                html_content = html_content.replace(node.node, node_ )
                node.node = node_
            })
            grunt.log.ok("css built")

            // look up for script files to compile with requirejs
            if( requirejs_src != false ){
                var found_rjs = false;
                for( var nn in requirejs_src ){
                    var rscripts = html_utils.find_rjs_nodes(html_content, requirejs_src[nn], base_url)
                    ForEachNodeFileFound(rscripts, paths, function(n, node, in_file){
                        deps.push(in_file)
                        var osrc = node.asrc.replace(".js",file_suffix+".js")
                        var msrc = node.asrc.replace(".js","")
                        msrc = msrc.replace(options.requirejs_baseUrl, "")

                        queue_requirejs_build(sub_tasks, current_target, out_path+osrc, osrc+".meta", msrc)

                        var node_ = "<script src='"+osrc+"'></script>"
                        html_content = html_content.replace(node.node, node_)
                    })
                    if( rscripts.length > 0 ){
                        grunt.log.ok("building requirejs scripts")
                        found_rjs = true
                        break;
                    }
                }
            }

            // look up for script files to compile with uglifyjs
            if( uglify_js ){
                var scripts = html_utils.find_scripts_nodes(html_content, base_url)
                ForEachNodeFileFound(scripts, paths, function(n, node, in_file){
                    if( in_file.indexOf("-min") == -1 &&  in_file.indexOf(".min") == -1 ){
                        deps.push(in_file)
                        var osrc = scripts[n].src
                        var tsrc = osrc.replace(file_suffix+".js", ".js")
                        tsrc = tsrc.replace(".js", "-min"+file_suffix+".js")
                        queue_uglifyjs_build( sub_tasks, current_target, out_path+tsrc, meta_dir, tsrc+".meta", in_file )
                        var node_ = "<script src='"+tsrc+"'></script>"
                        html_content = html_content.replace(scripts[n].node, node_)
                    }
                })
                grunt.log.ok("scripts minified")
            }

            // look up for <img src="?" /> file to compile
            if( imgcompressor ){
                var inodes = html_utils.find_img_nodes(html_content, base_url)
                ForEachNodeFileFound(inodes, paths, function(n, node, in_file){
                    if( in_file.match("\.(png|jpeg|jpg)$") != null ){
                        deps.push(in_file)
                        var osrc = node.src.replace(new RegExp("\.(png|jpeg|jpg)$"),file_suffix+".$1")
                        queue_img_opt(sub_tasks, current_target, out_path, meta_dir, paths, in_file, node.asrc, osrc, options )
                        html_content = html_content.replace(node.node, node.node.replace(node.src, osrc) )
                    }
                })
                // look up for background:url() file to compile
                var inodes = html_utils.find_style_nodes(html_content, base_url)
                ForEachImageFileFound(inodes, paths, function(n, node, in_file){
                    if( in_file.match("\.(png|jpeg|jpg)$") != null ){
                        deps.push(in_file)
                        var osrc = node.src.replace(new RegExp("\.(png|jpeg|jpg)$"),file_suffix+".$1")
                        queue_img_opt(sub_tasks, current_target, out_path, meta_dir, paths, in_file, node.asrc, osrc, options )
                        html_content = html_content.replace(node.node, node.node.replace(node.src, osrc) )
                    }
                })
                grunt.log.ok("images minified")
            }


            var current_html_in_file = in_file+".tmp"
            var current_html_meta_file = meta_file+".tmp"
            grunt.file.write(current_html_in_file, html_content);
            var current_html_out_file = out_file;
            // create manifest file
            if( manifest == true ){
                current_html_out_file = current_html_out_file+".no_manifest"
                current_html_meta_file = current_html_meta_file+".no_manifest"
                queue_html_manifest( sub_tasks, current_target, out_path, meta_dir, current_html_meta_file, current_html_out_file, in_request, current_html_in_file )
                current_html_in_file = current_html_out_file;
                current_html_out_file = out_file;
                grunt.log.ok("html manifest ")
            }

            // minify html
            if( htmlcompressor == true && false ){
                current_html_out_file = current_html_out_file+".no_min";
                current_html_meta_file = current_html_meta_file+".no_min";
                queue_html_min( sub_tasks, current_target, current_html_out_file, meta_dir, current_html_meta_file, current_html_in_file );
                current_html_in_file = current_html_out_file;
                current_html_out_file = out_file;
                grunt.log.ok("html minified");
            }

            queue_grunt_copy( meta_dir, sub_tasks, current_target, current_html_out_file, current_html_in_file )
            grunt.task.run( sub_tasks );

            // create a cache entry, so that later we can regen or check freshness
            var entry = meta_manager.create(deps);
            entry.require_task(current_grunt_task, current_grunt_opt);
            entry.save(meta_file);

        }else{
            grunt.log.ok("your build is fresh !")
        }
    });


    function must_find_in_paths(paths, src){
        var retour = find_in_paths(paths, src)
        if( retour == false ){
            grunt.log.error("File not found : "+src)
        }
        return retour
    }

    function find_in_paths(paths, src){
        var Path = require("path");
        for( var t in paths ){
            if( grunt.file.exists(paths[t]+src) ){
                return Path.resolve(paths[t]+src)
            }
        }
        return false
    }

    // -- htm manipulation

    function html_clean_css( html_content ){
        html_content = html_content.replace(/(<style[^>]*?\/?>\s*<\/style>)/gim, "")
        return html_content
    }


    // -- task queue-er
    function queue_html_min( sub_tasks, current_target, out_file, meta_dir, meta_file, in_file ){

        var jit_target = "jit"+sub_tasks.length;
        var task_name = "phantomizer-htmlcompressor";
        var task_options = grunt.config(task_name) || {};

        task_options = clone_subtasks_options(task_options, jit_target, current_target)
        task_options[jit_target].options.in_file = in_file;
        task_options[jit_target].options.out = out_file;
        task_options[jit_target].options.meta_file = meta_file;
        task_options[jit_target].options.meta_dir = meta_dir;

        grunt.config.set(task_name, task_options);
        sub_tasks.push( task_name+":"+jit_target );
    }
    function queue_html_manifest( sub_tasks, current_target, out_dir, meta_dir, meta_file, out_file, in_request, in_file ){

        var path = require('path');
        var jit_target = "jit"+sub_tasks.length;
        var task_name = "phantomizer-manifest-html";
        var task_options = grunt.config(task_name) || {};

        task_options = clone_subtasks_options(task_options, jit_target, current_target)
        task_options[jit_target].options.in_file = in_file;
        task_options[jit_target].options.out_file = out_file;
        task_options[jit_target].options.meta_file = meta_file;
        task_options[jit_target].options.base_url = path.dirname(in_request);
        task_options[jit_target].options.manifest_file = out_dir+in_request+"-"+current_target+".appcache";
        task_options[jit_target].options.manifest_meta = in_request+"-"+current_target+".appcache.meta";
        task_options[jit_target].options.manifest_url = in_request+"-"+current_target+".appcache";

        grunt.config.set(task_name, task_options);
        sub_tasks.push( task_name+":"+jit_target );
    }

    function queue_img_opt( sub_tasks, current_target, out_path, meta_dir, paths, in_file, asrc, osrc, options ){

        var jit_target = "jit"+sub_tasks.length;
        var task_name = "phantomizer-imgopt"
        var task_options = grunt.config(task_name) || {}

        task_options = clone_subtasks_options(task_options, jit_target, current_target)
        task_options[jit_target].options.out_dir = out_path;
        task_options[jit_target].options.meta_dir = meta_dir;
        task_options[jit_target].options.paths = paths;
        task_options[jit_target].options.in_files = {};

        task_options[jit_target].options.in_files[asrc] = osrc;

        if( options.img_variance ){
            for( var img_pattern in options.img_variance ){
                var regxp = new RegExp(img_pattern)
                var v_file = in_file.replace( regxp, options.img_variance[img_pattern]);
                if( v_file != in_file
                    && grunt.file.exists(v_file) ){
                    var v_src = asrc.replace( regxp, options.img_variance[img_pattern]);
                    var v_osrc = osrc.replace( regxp, options.img_variance[img_pattern]);
                    task_options[jit_target].options.in_files[v_src] = v_osrc;
                }
            }
        }

        sub_tasks.push( task_name+":"+jit_target )
        grunt.config.set(task_name, task_options)
    }

    function queue_uglifyjs_build( sub_tasks, current_target, out_file, meta_dir, meta_file, in_file ){

        var jit_target = "jit"+sub_tasks.length;
        var task_name = "phantomizer-uglifyjs"
        var task_options = grunt.config(task_name) || {}

        task_options = clone_subtasks_options(task_options, jit_target, current_target)
        if( !task_options[jit_target].files ) task_options[jit_target].files = {}
        task_options[jit_target].options.meta_dir = meta_dir
        task_options[jit_target].options.meta_file = meta_file
        task_options[jit_target].files[out_file] = [in_file]

        sub_tasks.push( task_name+":"+jit_target )

        grunt.config.set(task_name, task_options)
    }

    function queue_requirejs_build( sub_tasks, current_target, out_file, meta_file, module ){

        var jit_target = "jit"+sub_tasks.length;
        var task_name = "phantomizer-requirejs";
        var task_options = grunt.config(task_name) || {};

        task_options = clone_subtasks_options(task_options, jit_target, current_target);
        task_options[jit_target].options.out = out_file;
        task_options[jit_target].options.meta_file = meta_file;
        task_options[jit_target].options.include = [module];
        task_options[jit_target].options.insertRequire = [module];

        sub_tasks.push( task_name+":"+jit_target );

        grunt.config.set(task_name, task_options);
    }

    function queue_css_img_merge( sub_tasks, current_target, out_dir, meta_dir, osrc, tsrc, paths ){

        var merge_options = grunt.config("phantomizer-gm-merge") || {};
        var map = merge_options.options.in_files;

        var jit_target = "jit"+sub_tasks.length;
        var task_name = "phantomizer-css-imgmerge";
        var task_options = grunt.config(task_name) || {};

        task_options = clone_subtasks_options(task_options, jit_target, current_target)
        task_options[jit_target].options.in_request = osrc;
        task_options[jit_target].options.meta_dir = meta_dir;
        task_options[jit_target].options.out_file = out_dir+tsrc;
        task_options[jit_target].options.meta_file = tsrc+".meta";
        task_options[jit_target].options.paths = paths;
        task_options[jit_target].options.map = {};
        for(var tgt_file in map ){
            task_options[jit_target].options.map[tgt_file] = [];
            for( var k in map[tgt_file] ){
                var f = must_find_in_paths(paths, map[tgt_file][k]);
                if( f != false ) task_options[jit_target].options.map[tgt_file].push(f);
            }
        }

        sub_tasks.push( task_name+":"+jit_target );

        grunt.config.set(task_name, task_options);
    }

    function queue_img_merge( sub_tasks, current_target ){

        var jit_target = "jit"+sub_tasks.length;
        var task_name = "phantomizer-gm-merge";
        var task_options = grunt.config(task_name) || {};

        task_options = clone_subtasks_options(task_options, jit_target, current_target);

        sub_tasks.push( task_name+":"+jit_target );

        grunt.config.set(task_name, task_options);
    }

    function queue_css_build( sub_tasks, current_target, out_file, meta_file, in_file ){

        var jit_target = "jit"+sub_tasks.length;
        var task_name = "phantomizer-requirecss";
        var task_options = grunt.config(task_name) || {};

        task_options = clone_subtasks_options(task_options, jit_target, current_target);
        task_options[jit_target].options.cssIn = in_file;
        task_options[jit_target].options.out = out_file;
        task_options[jit_target].options.meta_file = meta_file;

        sub_tasks.push( task_name+":"+jit_target );

        grunt.config.set(task_name, task_options);
    }


    function queue_grunt_copy( meta_dir, sub_tasks, current_target, out_file, in_file ){

        var jit_target = "jit"+sub_tasks.length;
        var task_name = "phantomizer-finalizer";
        var task_options = grunt.config(task_name) || {};

        task_options = clone_subtasks_options(task_options, jit_target, current_target);
        task_options[jit_target].options.meta_dir = meta_dir;
        task_options[jit_target].options.copy = {};
        task_options[jit_target].options.copy[out_file] = in_file;

        sub_tasks.push( task_name+":"+jit_target );

        grunt.config.set(task_name, task_options);
    }

    function clone_subtasks_options(task_options, task_name, current_target){
        var _ = grunt.util._;
        if( task_options[current_target] ) task_options[task_name] = _.clone(task_options[current_target], true);
        if( !task_options[task_name] ) task_options[task_name] = {};
        if( !task_options[task_name].options ) task_options[task_name].options = {};
        return task_options;
    }
};