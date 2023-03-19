const {
  getPluginLink,
  toShortPluginId,
  matchesPluginId,
} = require("@vue/cli-shared-utils");
const { isBinaryFileSync } = require("isbinaryfile");
const { extractCallDir, isObject, mergeDeps } = require("./util/util");
const path = require("path");
const fs = require("fs");
const ejs = require("ejs");

class GeneratorAPI {
  constructor(id, generator, options, rootOptions) {
    this.id = id; // 插件 ID
    this.generator = generator; // Generator 实例
    this.options = options; // 插件 options
    this.rootOptions = rootOptions; // root options

    this.pluginsData = generator.plugins
      .filter(({ id }) => id !== "@vue/cli-service")
      .map(({ id }) => ({
        name: toShortPluginId(id),
        link: getPluginLink(id),
      }));

    this._entryFile = undefined;
  }

  render(source, additionalData = {}) {
    const baseDir = extractCallDir();

    if (typeof source === "string") {
      // 模版绝对路径
      source = path.resolve(baseDir, source);

      // 暂存
      this._injectFileMiddleware(async (files) => {
        const data = this._resolveData(additionalData);

        // 读取 source 目录下所有文件
        const globby = require("globby");
        const _files = await globby(["**/*"], { cwd: source, dot: true });

        // 生成文件时 _ 换成 .   __ 直接删除
        for (const rawPath of _files) {
          const targetPath = rawPath
            .split("/")
            .map((filename) => {
              if (filename.charAt(0) === "_" && filename.charAt(1) !== "_") {
                return `.${filename.slice(1)}`;
              }
              if (filename.charAt(0) === "_" && filename.charAt(1) === "_") {
                return `${filename.slice(1)}`;
              }
              return filename;
            })
            .join("/");

          // 绝对路径
          const sourcePath = path.resolve(source, rawPath);

          const content = this.renderFile(sourcePath, data);
          if (Buffer.isBuffer(content) || /[^\s]/.test(content)) {
            files[targetPath] = content;
          }
        }
      });
    }
  }

  // middleware 是一个函数，_injectFileMiddleware 用于暂存将 middleware 函数到 generator.fileMiddlewares。执行时接收"文件集合"参数，将 @vue/cli-service/generator/template 下的目录及文件提取给 Generator 实例的 files变量。
  _injectFileMiddleware(middleware) {
    this.generator.fileMiddlewares.push(middleware);
  }

  // 合并 option
  _resolveData(additionalData) {
    return Object.assign(
      {
        options: this.options,
        rootOptions: this.rootOptions,
        plugins: this.pluginsData,
      },
      additionalData
    );
  }

  renderFile(name, data) {
    // 二进制文件，如图片，直接返回
    if (isBinaryFileSync(name)) {
      return fs.readFileSync(name);
    }

    // 其他文件用 ejs 渲染返回
    const template = fs.readFileSync(name, "utf-8");
    return ejs.render(template, data);
  }

  // extendPackage 执行时，将相关配置提取到 Generator 实例的 pkg变量。
  extendPackage(fields, options = {}) {
    const pkg = this.generator.pkg;
    const toMerge = fields;

    for (const key in toMerge) {
      const value = toMerge[key];
      const existing = pkg[key];

      if (isObject(value) && isObject(existing)) {
        pkg[key] = mergeDeps(existing || {}, value);
      } else {
        // 不是对象则 pkg 直接放
        pkg[key] = value;
      }
    }
  }

  // 判断项目是否使用了该插件
  hasPlugin(id) {
    const pluginExists = [...this.generator.plugins.map((p) => p.id)].some(
      (pid) => matchesPluginId(id, pid)
    );

    return pluginExists;
  }
}

module.exports = GeneratorAPI;
