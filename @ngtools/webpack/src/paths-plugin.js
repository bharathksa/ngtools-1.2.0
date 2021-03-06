"use strict";
var path = require('path');
var ts = require('typescript');
var ModulesInRootPlugin = require('enhanced-resolve/lib/ModulesInRootPlugin');
var createInnerCallback = require('enhanced-resolve/lib/createInnerCallback');
var getInnerRequest = require('enhanced-resolve/lib/getInnerRequest');
function escapeRegExp(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
}
var PathsPlugin = (function () {
    function PathsPlugin(options) {
        var _this = this;
        if (!options.hasOwnProperty('tsConfigPath')) {
            // This could happen in JavaScript.
            throw new Error('tsConfigPath option is mandatory.');
        }
        this._tsConfigPath = options.tsConfigPath;
        if (options.hasOwnProperty('compilerOptions')) {
            this._compilerOptions = Object.assign({}, options.compilerOptions);
        }
        else {
            this._compilerOptions = PathsPlugin._loadOptionsFromTsConfig(this._tsConfigPath, null);
        }
        if (options.hasOwnProperty('compilerHost')) {
            this._host = options.compilerHost;
        }
        else {
            this._host = ts.createCompilerHost(this._compilerOptions, false);
        }
        this.source = 'described-resolve';
        this.target = 'resolve';
        this._absoluteBaseUrl = path.resolve(path.dirname(this._tsConfigPath), this._compilerOptions.baseUrl || '.');
        this.mappings = [];
        var paths = this._compilerOptions.paths || {};
        Object.keys(paths).forEach(function (alias) {
            var onlyModule = alias.indexOf('*') === -1;
            var excapedAlias = escapeRegExp(alias);
            var targets = paths[alias];
            targets.forEach(function (target) {
                var aliasPattern;
                if (onlyModule) {
                    aliasPattern = new RegExp("^" + excapedAlias + "$");
                }
                else {
                    var withStarCapturing = excapedAlias.replace('\\*', '(.*)');
                    aliasPattern = new RegExp("^" + withStarCapturing);
                }
                _this.mappings.push({
                    onlyModule: onlyModule,
                    alias: alias,
                    aliasPattern: aliasPattern,
                    target: target
                });
            });
        });
    }
    PathsPlugin._loadOptionsFromTsConfig = function (tsConfigPath, host) {
        var tsConfig = ts.readConfigFile(tsConfigPath, function (path) {
            if (host) {
                return host.readFile(path);
            }
            else {
                return ts.sys.readFile(path);
            }
        });
        if (tsConfig.error) {
            throw tsConfig.error;
        }
        return tsConfig.config;
    };
    PathsPlugin.prototype.apply = function (resolver) {
        var _this = this;
        var baseUrl = this._compilerOptions.baseUrl;
        if (baseUrl) {
            resolver.apply(new ModulesInRootPlugin('module', this._absoluteBaseUrl, 'resolve'));
        }
        this.mappings.forEach(function (mapping) {
            resolver.plugin(_this.source, _this.createPlugin(resolver, mapping));
        });
    };
    PathsPlugin.prototype.resolve = function (resolver, mapping, request, callback) {
        var innerRequest = getInnerRequest(resolver, request);
        if (!innerRequest) {
            return callback();
        }
        var match = innerRequest.match(mapping.aliasPattern);
        if (!match) {
            return callback();
        }
        var newRequestStr = mapping.target;
        if (!mapping.onlyModule) {
            newRequestStr = newRequestStr.replace('*', match[1]);
        }
        if (newRequestStr[0] === '.') {
            newRequestStr = path.resolve(this._absoluteBaseUrl, newRequestStr);
        }
        var newRequest = Object.assign({}, request, {
            request: newRequestStr
        });
        return resolver.doResolve(this.target, newRequest, "aliased with mapping '" + innerRequest + "': '" + mapping.alias + "' to '" + newRequestStr + "'", createInnerCallback(function (err, result) {
            if (arguments.length > 0) {
                return callback(err, result);
            }
            // don't allow other aliasing or raw request
            callback(null, null);
        }, callback));
    };
    PathsPlugin.prototype.createPlugin = function (resolver, mapping) {
        var _this = this;
        return function (request, callback) {
            try {
                _this.resolve(resolver, mapping, request, callback);
            }
            catch (err) {
                callback(err);
            }
        };
    };
    return PathsPlugin;
}());
exports.PathsPlugin = PathsPlugin;
//# sourceMappingURL=/Users/hansl/Sources/angular-cli/packages/@ngtools/webpack/src/paths-plugin.js.map