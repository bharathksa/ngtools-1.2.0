"use strict";
var path = require('path');
var ts = require('typescript');
var plugin_1 = require('./plugin');
var refactor_1 = require('./refactor');
var loaderUtils = require('loader-utils');
function _getContentOfKeyLiteral(source, node) {
    if (node.kind == ts.SyntaxKind.Identifier) {
        return node.text;
    }
    else if (node.kind == ts.SyntaxKind.StringLiteral) {
        return node.text;
    }
    else {
        return null;
    }
}
function _removeDecorators(refactor) {
    // TODO: replace this by tsickle.
    // Find all decorators.
    // refactor.findAstNodes(refactor.sourceFile, ts.SyntaxKind.Decorator)
    //   .forEach(d => refactor.removeNode(d));
}
function _replaceBootstrap(plugin, refactor) {
    // If bootstrapModule can't be found, bail out early.
    if (!refactor.sourceMatch(/\bbootstrapModule\b/)) {
        return;
    }
    // Calculate the base path.
    var basePath = path.normalize(plugin.basePath);
    var genDir = path.normalize(plugin.genDir);
    var dirName = path.normalize(path.dirname(refactor.fileName));
    var entryModule = plugin.entryModule;
    var entryModuleFileName = path.normalize(entryModule.path + '.ngfactory');
    var relativeEntryModulePath = path.relative(basePath, entryModuleFileName);
    var fullEntryModulePath = path.resolve(genDir, relativeEntryModulePath);
    var relativeNgFactoryPath = path.relative(dirName, fullEntryModulePath);
    var ngFactoryPath = './' + relativeNgFactoryPath.replace(/\\/g, '/');
    var allCalls = refactor.findAstNodes(refactor.sourceFile, ts.SyntaxKind.CallExpression, true);
    var bootstraps = allCalls
        .filter(function (call) { return call.expression.kind == ts.SyntaxKind.PropertyAccessExpression; })
        .map(function (call) { return call.expression; })
        .filter(function (access) {
        return access.name.kind == ts.SyntaxKind.Identifier
            && access.name.text == 'bootstrapModule';
    });
    var calls = bootstraps
        .reduce(function (previous, access) {
        var expressions = refactor.findAstNodes(access, ts.SyntaxKind.CallExpression, true);
        return previous.concat(expressions);
    }, [])
        .filter(function (call) {
        return call.expression.kind == ts.SyntaxKind.Identifier
            && call.expression.text == 'platformBrowserDynamic';
    });
    if (calls.length == 0) {
        // Didn't find any dynamic bootstrapping going on.
        return;
    }
    // Create the changes we need.
    allCalls
        .filter(function (call) { return bootstraps.some(function (bs) { return bs == call.expression; }); })
        .forEach(function (call) {
        refactor.replaceNode(call.arguments[0], entryModule.className + 'NgFactory');
    });
    calls.forEach(function (call) { return refactor.replaceNode(call.expression, 'platformBrowser'); });
    bootstraps
        .forEach(function (bs) {
        // This changes the call.
        refactor.replaceNode(bs.name, 'bootstrapModuleFactory');
    });
    refactor.insertImport('platformBrowser', '@angular/platform-browser');
    refactor.insertImport(entryModule.className + 'NgFactory', ngFactoryPath);
}
function _replaceResources(refactor) {
    var sourceFile = refactor.sourceFile;
    // Find all object literals.
    refactor.findAstNodes(sourceFile, ts.SyntaxKind.ObjectLiteralExpression, true)
        .map(function (node) { return refactor.findAstNodes(node, ts.SyntaxKind.PropertyAssignment); })
        .reduce(function (prev, curr) { return curr ? prev.concat(curr) : prev; }, [])
        .filter(function (node) {
        var key = _getContentOfKeyLiteral(sourceFile, node.name);
        if (!key) {
            // key is an expression, can't do anything.
            return false;
        }
        return key == 'templateUrl' || key == 'styleUrls';
    })
        .forEach(function (node) {
        var key = _getContentOfKeyLiteral(sourceFile, node.name);
        if (key == 'templateUrl') {
            refactor.replaceNode(node, "template: require(" + node.initializer.getFullText(sourceFile) + ")");
        }
        else if (key == 'styleUrls') {
            var arr = (refactor.findAstNodes(node, ts.SyntaxKind.ArrayLiteralExpression, false));
            if (!arr || arr.length == 0 || arr[0].elements.length == 0) {
                return;
            }
            var initializer = arr[0].elements.map(function (element) {
                return element.getFullText(sourceFile);
            });
            refactor.replaceNode(node, "styles: [require(" + initializer.join('), require(') + ")]");
        }
    });
}
function _checkDiagnostics(refactor) {
    var diagnostics = refactor.getDiagnostics();
    if (diagnostics.length > 0) {
        var message = diagnostics
            .map(function (diagnostic) {
            var _a = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start), line = _a.line, character = _a.character;
            var message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
            return diagnostic.file.fileName + " (" + (line + 1) + "," + (character + 1) + "): " + message + ")";
        })
            .join('\n');
        throw new Error(message);
    }
}
// Super simple TS transpiler loader for testing / isolated usage. does not type check!
function ngcLoader(source) {
    this.cacheable();
    var cb = this.async();
    var sourceFileName = this.resourcePath;
    var plugin = this._compilation._ngToolsWebpackPluginInstance;
    // We must verify that AotPlugin is an instance of the right class.
    if (plugin && plugin instanceof plugin_1.AotPlugin) {
        var refactor_2 = new refactor_1.TypeScriptFileRefactor(sourceFileName, plugin.compilerHost, plugin.program);
        Promise.resolve()
            .then(function () {
            if (!plugin.skipCodeGeneration) {
                return Promise.resolve()
                    .then(function () { return _removeDecorators(refactor_2); })
                    .then(function () { return _replaceBootstrap(plugin, refactor_2); });
            }
            else {
                return _replaceResources(refactor_2);
            }
        })
            .then(function () {
            if (plugin.typeCheck) {
                _checkDiagnostics(refactor_2);
            }
        })
            .then(function () {
            // Force a few compiler options to make sure we get the result we want.
            var compilerOptions = Object.assign({}, plugin.compilerOptions, {
                inlineSources: true,
                inlineSourceMap: false,
                sourceRoot: plugin.basePath
            });
            var result = refactor_2.transpile(compilerOptions);
            cb(null, result.outputText, result.sourceMap);
        })
            .catch(function (err) { return cb(err); });
    }
    else {
        var options = loaderUtils.parseQuery(this.query);
        var tsConfigPath = options.tsConfigPath;
        var tsConfig = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
        if (tsConfig.error) {
            throw tsConfig.error;
        }
        var compilerOptions = tsConfig.config.compilerOptions;
        for (var _i = 0, _a = Object.keys(options); _i < _a.length; _i++) {
            var key = _a[_i];
            if (key == 'tsConfigPath') {
                continue;
            }
            compilerOptions[key] = options[key];
        }
        var compilerHost = ts.createCompilerHost(compilerOptions);
        var refactor = new refactor_1.TypeScriptFileRefactor(sourceFileName, compilerHost);
        _replaceResources(refactor);
        var result = refactor.transpile(compilerOptions);
        // Webpack is going to take care of this.
        result.outputText = result.outputText.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, '');
        cb(null, result.outputText, result.sourceMap);
    }
}
exports.ngcLoader = ngcLoader;
//# sourceMappingURL=/Users/hansl/Sources/angular-cli/packages/@ngtools/webpack/src/loader.js.map