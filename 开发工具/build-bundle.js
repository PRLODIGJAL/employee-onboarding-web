/**
 * 把小程序里的纯逻辑模块打包成浏览器可用的 bundle.js
 *
 * 目的：网页原型和小程序共用同一份 schema / 校验 / 导出逻辑，
 *      改一次两边同时生效，不做第二套实现。
 *
 * 用法：node 开发工具/build-bundle.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '旧小程序', 'miniprogram');
const MODULES = [
  'config/options',
  'config/roster-template',
  'config/form-schema',
  'utils/idcard',
  'utils/validators',
  'utils/exporter'
];

/** 简易路径解析：resolve('utils/exporter', '../config/form-schema') -> 'config/form-schema' */
function resolve(from, to) {
  const base = from.split('/').slice(0, -1);
  to.split('/').forEach(seg => {
    if (!seg || seg === '.') return;
    if (seg === '..') base.pop();
    else base.push(seg);
  });
  return base.join('/');
}

const parts = [];

parts.push(`/* 自动生成，请勿手改。源文件：miniprogram/config/*.js  miniprogram/utils/*.js */
/* 生成命令：node web/build-bundle.js */
(function () {
  'use strict';
  var __defs = {};
  var __cache = {};

  function __resolve(from, to) {
    var base = from.split('/').slice(0, -1);
    to.split('/').forEach(function (seg) {
      if (!seg || seg === '.') return;
      if (seg === '..') base.pop();
      else base.push(seg);
    });
    return base.join('/');
  }

  function __req(from, id) {
    var key = __resolve(from, id);
    if (__cache[key]) return __cache[key].exports;
    if (!__defs[key]) throw new Error('模块未找到: ' + key);
    var mod = { exports: {} };
    __cache[key] = mod;
    __defs[key](mod, mod.exports, function (child) { return __req(key, child); });
    return mod.exports;
  }
`);

MODULES.forEach(id => {
  const file = path.join(ROOT, id + '.js');
  const src = fs.readFileSync(file, 'utf8');
  parts.push(`\n  /* ================= ${id} ================= */`);
  parts.push(`  __defs['${id}'] = function (module, exports, require) {\n${src}\n  };\n`);
});

parts.push(`
  window.APP = {
    schema: __req('', 'config/form-schema'),
    rosterTemplate: __req('', 'config/roster-template'),
    options: __req('', 'config/options'),
    idcard: __req('', 'utils/idcard'),
    validators: __req('', 'utils/validators'),
    exporter: __req('', 'utils/exporter')
  };
})();
`);

const out = path.join(__dirname, '..', '网页', 'bundle.js');
fs.writeFileSync(out, parts.join(''), 'utf8');
console.log('已生成 ' + out + '  (' + (fs.statSync(out).size / 1024).toFixed(1) + ' KB)');
