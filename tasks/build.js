'use strict';

module.exports = function(grunt) {

  var path = require('path');
  var ProgressBar = require('progress');

  var ph_libutil = require("phantomizer-libutil");

  grunt.registerMultiTask("phantomizer-html-assets",
    "Parse and optimize assets of an HTML file", function () {

      var options = this.options({
        meta_file:'',
        in_file:'',
        out:'',
        in_request:'/',
        file_suffix:'-opt',

        out_path:'<%= out_path %>',
        paths:'<%= paths %>',

        manifest:false,
        requirejs_src:false,
        requirejs_burl:'',
        uglify_js:false,
        imgcompressor:false,
        image_merge:false,

        as_of_target: this.target
      });
      grunt.verbose.writeflags(options, "htmlassets");

      var meta_file       = options.meta_file;
      var in_file         = options.in_file;
      var in_request      = options.in_request;
      var out_file        = options.out;

      var out_path        = options.out_path;

      var current_target  = options.as_of_target;
      var current_grunt_task  = this.nameArgs;
      var current_grunt_opt   = this.options();

      grunt.log.ok("Parse and optimize HTML assets: "+in_request);


// get phantomizer main instance
      var Phantomizer = ph_libutil.Phantomizer;
      var phantomizer = new Phantomizer(process.cwd(),grunt);
      var meta_manager = phantomizer.get_meta_manager();

      if( meta_manager.is_fresh(meta_file, current_grunt_task) == false ){
        var sub_tasks = [];
        var deps = parse_html_and_queue_opimizations(
          sub_tasks,
          in_request,
          in_file,
          out_file,
          meta_file,
          current_target,
          options,
          grunt.log);

// create a cache entry, so that later we can regen or check freshness
        var entry = meta_manager.load(meta_file);
        entry.append_dependency(__filename);
        entry.append_dependency(in_file);
        entry.load_dependencies(deps);
        entry.require_task(current_grunt_task, current_grunt_opt);
        entry.save(meta_file);

// queue next tasks
        grunt.task.run( sub_tasks );
      }else{
          grunt.log.ok("your build is fresh !\n\t"+in_request);
      }

    });


  grunt.registerMultiTask("phantomizer-html-project-assets",
    "Parse and optimize assets of an HTML file", function () {

      var options = this.options({
        urls_file:'',

        file_suffix:'-opt',

        out_path:'<%= out_path %>',
        paths:'<%= paths %>',

        requirejs_src:false,
        requirejs_burl:'',
        uglify_js:false,

        as_of_target: this.target
      });
      grunt.verbose.writeflags(options,"htmlassets");

      var urls_file      = options.urls_file;

      var out_path        = options.out_path;

      var current_grunt_task  = this.nameArgs;
      var current_grunt_opt   = this.options();


      var current_target  = options.as_of_target;


      // fetch urls to build
      var raw_urls = grunt.file.readJSON(urls_file);
      if( raw_urls.length == 0 ){
        return;
      }

      grunt.log.ok("Parse and optimize HTML assets: "+raw_urls.length);


// initialize a progress bar
      var bar = new ProgressBar(' done=[:current/:total] elapsed=[:elapseds] sprint=[:percent] eta=[:etas] [:bar]', {
        complete: '#'
        , incomplete: '-'
        , width: 80
        , total: raw_urls.length
      });


// get phantomizer main instance
      var Phantomizer = ph_libutil.Phantomizer;
      var phantomizer = new Phantomizer(process.cwd(),grunt);
      var meta_manager = phantomizer.get_meta_manager();

      var sub_tasks = [];
      for( var n in raw_urls ){
        var meta_file = raw_urls[n].raw_in_request+"-"+current_target;
        if( meta_manager.is_fresh(meta_file, current_grunt_task) == false ){
          var deps = parse_html_and_queue_opimizations(
            sub_tasks,
            raw_urls[n].raw_in_request,
            raw_urls[n].in_file,
            raw_urls[n].out_file,
            meta_file,
            current_target,
            options,
            grunt.verbose);

// create a cache entry, so that later we can regen or check freshness
          var entry = meta_manager.load(meta_file);
          entry.append_dependency(raw_urls[n].in_file);
          entry.append_dependency(__filename);
          entry.load_dependencies(deps);
          entry.require_task(current_grunt_task, current_grunt_opt);
          entry.save(meta_file);

          bar.tick();
        }else{
            grunt.log.ok("your build is fresh !\n\t"+raw_urls[n].raw_in_request);
        }
      }
      grunt.log.ok();

// queue next tasks
      grunt.task.run( sub_tasks );

    });

  // html parsing and task queueing
  function parse_html_and_queue_opimizations(sub_tasks, in_request, in_file, out_file, meta_file, current_target, options, logger){

    var wd = process.cwd();
    var base_url = path.dirname(in_request);

    var phantomizer_helper = ph_libutil.phantomizer_helper;
    var html_utils = ph_libutil.html_utils;
    var deps = [];

    var file_suffix     = options.file_suffix;

    var out_path        = options.out_path;
    var paths           = options.paths;

    var manifest        = options.manifest || false;
    var image_merge     = options.image_merge || false;
    var imgcompressor   = options.imgcompressor || false;
    var uglify_js       = options.uglify_js || false;

    var requirejs_src   = options.requirejs_src;
    if( requirejs_src && requirejs_src.substring ) requirejs_src = [requirejs_src];
    var requirejs_burl  = options.requirejs_baseUrl;
    var requirejs_paths = options.requirejs_paths;


    var html_content = grunt.file.read(in_file).toString();

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
    html_content = html_clean_css(html_content);
    logger.ok("html cleaned");


    if( image_merge ){
      queue_img_merge(sub_tasks, current_target );
    }

// look up for css file to compile <link rel="stylesheet" href="?">
    var lnodes = html_utils.find_link_nodes(html_content, base_url);
    ForEachNodeFileFound(lnodes, paths, function(n, node, node_file){
      deps.push(node_file);

      var osrc = node.src;
      if( osrc.indexOf("-min") == -1 &&
        osrc.indexOf(".min") == -1 &&
        osrc.indexOf(file_suffix) == -1 ){
        osrc = node.src.replace(".css",file_suffix+".css");
        queue_css_build(sub_tasks, current_target, out_path+osrc, osrc+"", node_file, osrc);
      }else{
        logger.ok("Already minified\n\t"+osrc );
      }

      if( image_merge &&
        osrc.indexOf("-im") == -1 ){
        var tsrc = osrc.replace(file_suffix+".css", ".css");
        tsrc = tsrc.replace(".css", "-im"+file_suffix+".css");
        queue_css_img_merge( sub_tasks, current_target, out_path, osrc, tsrc, paths );
        osrc = tsrc;
      }else if(image_merge){
        logger.ok("Already merged image\n\t"+osrc );
      }

      html_content = html_content.replace(node.node, node.node.replace(node.src, osrc) );
    });
    logger.ok("<link /> built");

// look up for <style /> nodes
    var snodes = html_utils.find_style_nodes(html_content, base_url);
    ForEachRuleFileFound(snodes, paths, function(n, node, k, rule, node_file){
      deps.push(node_file);

      var osrc = rule.src;

      if( osrc.indexOf("-min") == -1 &&
        osrc.indexOf(".min") == -1 &&
        osrc.indexOf(file_suffix) == -1 ){
        osrc = rule.src.replace(".css",file_suffix+".css");
        queue_css_build(sub_tasks, current_target, out_path+osrc, osrc+"", node_file, osrc);
      }else{
        logger.ok("Already minified\n\t"+osrc );
      }

      if( image_merge && osrc.indexOf("-im") == -1 ){
        var tsrc = osrc.replace(file_suffix+".css", ".css");
        tsrc = tsrc.replace(".css", "-im"+file_suffix+".css");
        queue_css_img_merge( sub_tasks, current_target, out_path, osrc, tsrc, paths );
        osrc = tsrc;
      }else{
        logger.ok("Already merged image\n\t"+osrc);
      }

      var node_ = node.node.replace(rule.src, osrc);
      html_content = html_content.replace(node.node, node_);
      node.node = node_;
    });
    logger.ok("<style /> built");



// look up for script files to compile with requirejs
    if( requirejs_src != false ){
      var found_rjs = false;
      for( var nn in requirejs_src ){
// look up for a data-main attached to requirejs url
        var rscripts = html_utils.find_rjs_nodes(html_content, requirejs_src[nn], requirejs_burl);
        if( rscripts.length > 0 ){
          logger.ok("building requirejs scripts");
          found_rjs = true;

          ForEachNodeFileFound(rscripts, paths, function(n, node, node_file){
            deps.push(node_file);
            var tsrc = node.asrc.replace(".js",file_suffix+".js");
            var msrc = node.asrc.replace(".js","");
            msrc = msrc.replace(requirejs_burl, "");

            queue_requirejs_build(sub_tasks, current_target, out_path+tsrc, tsrc+"", msrc);

// apply the optimized version of the script in HTML
            var node_ = "<script src='"+tsrc+"' optimized='true'></script>";
            html_content = html_content.replace(phantomizer_helper.get_r_config(requirejs_burl,requirejs_paths), "");
            html_content = html_content.replace(node.node, node_);
          });

          // stops on first requirejs src found
          break;
        }
      }
    }


// look up for script files to compile with uglifyjs
    if( uglify_js ){
      var scripts = html_utils.find_scripts_nodes(html_content, base_url);
      ForEachNodeFileFound(scripts, paths, function(n, node, node_file){
        if( node_file.indexOf("-min") == -1 &&
          node_file.indexOf(".min") == -1 &&
          node_file.indexOf(file_suffix) == -1 ){
          deps.push(node_file);
          var osrc = scripts[n].src;
          var tsrc = osrc.replace(file_suffix+".js", ".js");
          tsrc = tsrc.replace(".js", "-min"+file_suffix+".js");

          queue_uglifyjs_build( sub_tasks, current_target, out_path+tsrc, tsrc+"", node_file, osrc );
          var node_ = "<script src='"+tsrc+"'></script>";
          html_content = html_content.replace(scripts[n].node, node_);
          logger.ok("Uglifying "+osrc);
        }else{
          logger.ok("Already minified\n\t"+path.relative(wd,node_file));
        }
      });
    }

// look up for <img src="?" /> file to compile
    if( imgcompressor ){
      var inodes = html_utils.find_img_nodes(html_content, base_url);
      ForEachNodeFileFound(inodes, paths, function(n, node, node_file){
        if( node_file.match(/[.](png|jpeg|jpg)$/) != null &&
          node_file.indexOf(file_suffix) == -1 ){
          deps.push(node_file);
          var osrc = node.src.replace(new RegExp("[.](png|jpeg|jpg)$"),file_suffix+".$1");
          queue_img_opt(sub_tasks, current_target, out_path, paths, node_file, node.asrc, osrc, options );
          html_content = html_content.replace(node.node, node.node.replace(node.src, osrc) );
          logger.ok("Compressing "+node.src);
        }else{
          logger.ok("Already minified\n\t"+path.relative(wd,node_file));
        }
      });
// look up for background:url() file to compile
      var inodes = html_utils.find_style_nodes(html_content, base_url);
      ForEachImageFileFound(inodes, paths, function(n, node, node_file){
        if( node_file.match(/[.](png|jpeg|jpg)$/) != null &&
          node_file.indexOf(file_suffix) == -1 ){
          deps.push(node_file)
          var osrc = node.src.replace(new RegExp("[.](png|jpeg|jpg)$"),file_suffix+".$1")
          queue_img_opt(sub_tasks, current_target, out_path, paths, node_file, node.asrc, osrc, options );
          html_content = html_content.replace(node.node, node.node.replace(node.src, osrc) );
          logger.ok("Compressing "+node.src);
        }else{
          logger.ok("Already minified\n\t"+path.relative(wd,node_file));
        }
      });
      logger.ok("images minified");
    }


// write optimized html file
    grunt.file.write(out_file, html_content);
    logger.ok("HTML File created\n\t"+path.relative(wd,out_file));

// create manifest file
    if( manifest == true ){
      queue_html_manifest( sub_tasks, current_target, out_path, meta_file, out_file, in_request, out_file );
      logger.ok("html manifest queued");
    }

    return deps;
  }


// given a list of nodes, identify and merge those which has a corresponding file on drive
  function ForEachNodeFileFound ( nodes, paths, cb ){
    for( var n in nodes ){
      if( nodes[n].has_domain == false ){
        var node_file = nodes[n].asrc
        var _in_file = find_in_paths(paths,node_file)
        if( _in_file != false ){
          node_file = _in_file
          cb(n, nodes[n], node_file)
        }else{
          grunt.verbose.error("File is missing\n\t"+node_file)
        }
      }
    }
  };
// given a list of nodes, searches for those which holds css reference
  function ForEachRuleFileFound ( nodes, paths, cb ){
    for( var n in nodes ){
      for( var k in nodes[n].imports ){
        var import_rule = nodes[n].imports[k]
        if( import_rule.has_domain == false ){
          var node_file = import_rule.asrc
          var _in_file = find_in_paths(paths,node_file)
          if( _in_file != false ){
            node_file = _in_file
            cb(n, nodes[n], k, import_rule, node_file)
          }else{
            grunt.verbose.error("File is missing\n\t"+node_file)
          }
        }
      }
    }
  };
// given a list of nodes, searches for those which are css nodes, and that has img
  function ForEachImageFileFound ( nodes, paths, cb ){
    for( var n in nodes ){
      for( var k in nodes[n].imgs ){
        var import_img = nodes[n].imgs[k]
        if( import_img.has_domain == false ){
          var node_file = import_img.asrc
          var _in_file = find_in_paths(paths,node_file)
          if( _in_file != false ){
            node_file = _in_file
            cb(n, nodes[n], k, import_img, node_file)
          }else{
            grunt.verbose.error("File is missing\n\t"+node_file)
          }
        }
      }
    }
  }


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
  function queue_html_manifest( sub_tasks, current_target, out_dir, meta_file, out_file, in_request, in_file ){

    var path = require('path');
    var jit_target = ""+in_request;
    var task_name = "phantomizer-manifest-html";
    if( sub_tasks.indexOf(task_name+":"+jit_target) == -1 ){
      var task_options = grunt.config(task_name) || {};

      task_options = clone_subtasks_options(task_options, jit_target, current_target);
      task_options[jit_target].options.in_file = in_file;
      task_options[jit_target].options.out_file = out_file;
      task_options[jit_target].options.meta_file = meta_file;
      task_options[jit_target].options.base_url = path.dirname(in_request);
      task_options[jit_target].options.manifest_file = out_dir+in_request+"-"+current_target+".appcache";
      task_options[jit_target].options.manifest_meta = in_request+"-"+current_target+".appcache";
      task_options[jit_target].options.manifest_url = in_request+"-"+current_target+".appcache";

      grunt.config.set(task_name, task_options);
      sub_tasks.push( "throttle:20" );
      sub_tasks.push( task_name+":"+jit_target );
    }
  }

  function queue_img_opt( sub_tasks, current_target, out_path, paths, in_file, asrc, osrc, options ){

    var jit_target = ""+asrc;
    var task_name = "phantomizer-imgopt";

    if( sub_tasks.indexOf(task_name+":"+jit_target) == -1 ){

      var task_options = grunt.config(task_name) || {};
      task_options = clone_subtasks_options(task_options, jit_target, current_target);
      task_options[jit_target].options.out_dir = out_path;
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

      sub_tasks.push( task_name+":"+jit_target );
      sub_tasks.push( "throttle:20" );
      grunt.config.set(task_name, task_options);
    }

  }

  function queue_uglifyjs_build( sub_tasks, current_target, out_file, meta_file, in_file, in_request ){

    var jit_target = ""+in_request;
    var task_name = "phantomizer-uglifyjs";
    if( sub_tasks.indexOf(task_name+":"+jit_target) == -1 ){

      var task_options = grunt.config(task_name) || {};
      task_options = clone_subtasks_options(task_options, jit_target, current_target);
      if( !task_options[jit_target].files ) task_options[jit_target].files = {};
      task_options[jit_target].options.meta_file = meta_file;
      task_options[jit_target].files[out_file] = [in_file];

      sub_tasks.push( task_name+":"+jit_target );
      sub_tasks.push( "throttle:20" );
      grunt.config.set(task_name, task_options);
    }
  }

  function queue_requirejs_build( sub_tasks, current_target, out_file, meta_file, module ){

    var jit_target = ""+module;
    var task_name = "phantomizer-requirejs";
    if( sub_tasks.indexOf(task_name+":"+jit_target) == -1 ){

      var task_options = grunt.config(task_name) || {};
      task_options = clone_subtasks_options(task_options, jit_target, current_target);
      task_options[jit_target].options.out = out_file;
      task_options[jit_target].options.meta_file = meta_file;
      task_options[jit_target].options.include = [module];
      task_options[jit_target].options.insertRequire = [module];

      sub_tasks.push( task_name+":"+jit_target );
      sub_tasks.push( "throttle:20" );
      grunt.config.set(task_name, task_options);
    }
  }

  function queue_css_img_merge( sub_tasks, current_target, out_dir, osrc, tsrc, paths ){

    var merge_options = grunt.config("phantomizer-gm-merge") || {};
    var map = merge_options.options.in_files;

    var jit_target = ""+tsrc;
    var task_name = "phantomizer-css-imgmerge";

    if( sub_tasks.indexOf(task_name+":"+jit_target) == -1 ){
      var task_options = grunt.config(task_name) || {};

      task_options = clone_subtasks_options(task_options, jit_target, current_target)
      task_options[jit_target].options.in_request = osrc;
      task_options[jit_target].options.out_file = out_dir+tsrc;
      task_options[jit_target].options.meta_file = tsrc+"";
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
      sub_tasks.push( "throttle:20" );
      grunt.config.set(task_name, task_options);
    }
  }

  function queue_img_merge( sub_tasks, current_target ){

    var jit_target = "jit"+sub_tasks.length;
    var task_name = "phantomizer-gm-merge";

    if( sub_tasks.indexOf(task_name+":"+jit_target) == -1 ){
      var task_options = grunt.config(task_name) || {};

      task_options = clone_subtasks_options(task_options, jit_target, current_target);

      sub_tasks.push( task_name+":"+jit_target );
      sub_tasks.push( "throttle:20" );
      grunt.config.set(task_name, task_options);
    }
  }

  function queue_css_build( sub_tasks, current_target, out_file, meta_file, in_file, in_request ){

    var jit_target = ""+in_request;
    var task_name = "phantomizer-requirecss";

    if( sub_tasks.indexOf(task_name+":"+jit_target) == -1 ){
      var task_options = grunt.config(task_name) || {};

      task_options = clone_subtasks_options(task_options, jit_target, current_target);
      task_options[jit_target].options.cssIn = in_file;
      task_options[jit_target].options.out = out_file;
      task_options[jit_target].options.meta_file = meta_file;

      sub_tasks.push( task_name+":"+jit_target );
      sub_tasks.push( "throttle:20" );
      grunt.config.set(task_name, task_options);
    }
  }

  function clone_subtasks_options(task_options, task_name, current_target){
    var _ = grunt.util._;
    if( task_options[current_target] ) task_options[task_name] = _.clone(task_options[current_target], true);
    if( !task_options[task_name] ) task_options[task_name] = {};
    if( !task_options[task_name].options ) task_options[task_name].options = {};
    return task_options;
  }
};