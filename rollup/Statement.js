import { walk } from 'estree-walker';
import Scope from './ast/Scope.js';
import attachScopes from './ast/attachScopes.js';
import modifierNodes, { isModifierNode } from './ast/modifierNodes.js';
import isFunctionDeclaration from './ast/isFunctionDeclaration.js';
import isReference from './ast/isReference.js';
import getLocation from './utils/getLocation.js';
import run from './utils/run.js';
import { Reference } from './Reference.js';

export default class Statement {
	constructor ( node, module, start, end ) {
		this.node = node;
		this.module = module;
		this.start = start;
		this.end = end;
		this.next = null; // filled in later

		this.scope = new Scope({ statement: this });

		this.references = [];
		this.stringLiteralRanges = [];

		this.isIncluded = false;
		this.ran = false;

		this.isImportDeclaration = node.type === 'ImportDeclaration';
		this.isExportDeclaration = /^Export/.test( node.type );
		this.isReexportDeclaration = this.isExportDeclaration && !!node.source;

		this.isFunctionDeclaration = isFunctionDeclaration( node ) ||
			this.isExportDeclaration && isFunctionDeclaration( node.declaration );
	}

	firstPass () {
		if ( this.isImportDeclaration ) return; // nothing to analyse

		// attach scopes
		attachScopes( this );
		// wk 找reference,这是后续进行 bindAlias 和bindReferences的基础
		// find references
		const statement = this;
		let { module, references, scope, stringLiteralRanges } = this;
		let contextDepth = 0;

		walk( this.node, {
			enter ( node, parent, prop ) {
				// warn about eval
				if ( node.type === 'CallExpression' && node.callee.name === 'eval' && !scope.contains( 'eval' ) ) {
					// TODO show location
					module.bundle.onwarn( `Use of \`eval\` (in ${module.id}) is strongly discouraged, as it poses security risks and may cause issues with minification. See https://github.com/rollup/rollup/wiki/Troubleshooting#avoiding-eval for more details` );
				}

				// skip re-export declarations
				if ( node.type === 'ExportNamedDeclaration' && node.source ) return this.skip();

				if ( node.type === 'TemplateElement' ) stringLiteralRanges.push([ node.start, node.end ]);
				if ( node.type === 'Literal' && typeof node.value === 'string' && /\n/.test( node.raw ) ) {
					stringLiteralRanges.push([ node.start + 1, node.end - 1 ]);
				}

				if ( node.type === 'ThisExpression' && contextDepth === 0 ) {
					module.magicString.overwrite( node.start, node.end, 'undefined' );
					module.bundle.onwarn( 'The `this` keyword is equivalent to `undefined` at the top level of an ES module, and has been rewritten' );
				}

				if ( node._scope ) scope = node._scope;
				if ( /^Function/.test( node.type ) ) contextDepth += 1;

				let isReassignment;

				if ( parent && isModifierNode( parent ) ) {
					let subject = parent[ modifierNodes[ parent.type ] ];

					if ( node === subject ) {
						let depth = 0;

						while ( subject.type === 'MemberExpression' ) {
							subject = subject.object;
							depth += 1;
						}

						const importDeclaration = module.imports[ subject.name ];

						if ( !scope.contains( subject.name ) && importDeclaration ) {
							const minDepth = importDeclaration.name === '*' ?
								2 : // cannot do e.g. `namespace.foo = bar`
								1;  // cannot do e.g. `foo = bar`, but `foo.bar = bar` is fine

							if ( depth < minDepth ) {
								const err = new Error( `Illegal reassignment to import '${subject.name}'` );
								err.file = module.id;
								err.loc = getLocation( module.magicString.original, subject.start );
								throw err;
							}
						}

						isReassignment = !depth;
					}
				}
				// wk isReference 没看懂，大意应该是指这个node是否是从其他地方定义的
				// wk  如果是的话就建一条 reference
				if ( isReference( node, parent ) ) {
					// function declaration IDs are a special case – they're associated
					// with the parent scope
					const referenceScope = parent.type === 'FunctionDeclaration' && node === parent.id ?
						scope.parent :
						scope;

					const isShorthandProperty = parent.type === 'Property' && parent.shorthand;

					// Since `node.key` can equal `node.value` for shorthand properties
					// we must use the `prop` argument provided by `estree-walker` to determine
					// if we're looking at the key or the value.
					// If they are equal, we'll return to not create duplicate references.
					if ( isShorthandProperty && parent.value === parent.key && prop === 'value' ) {
						return;
					}

					const reference = new Reference( node, referenceScope, statement );
					reference.isReassignment = isReassignment;
					reference.isShorthandProperty = isShorthandProperty;
					references.push( reference );

					this.skip(); // don't descend from `foo.bar.baz` into `foo.bar`
				}
			},
			leave ( node ) {
				if ( node._scope ) scope = scope.parent;
				if ( /^Function/.test( node.type ) ) contextDepth -= 1;
			}
		});
	}

	mark () {
		if ( this.isIncluded ) return; // prevent infinite loops
		// wk 这个statement的isIncluded 设为true
		this.isIncluded = true;

		// wk 这个statement使用的相关变量定义的地方也要执行declaration.use()
		this.references.forEach( reference => {
			if ( reference.declaration ) reference.declaration.use();
		});
	}

	run ( strongDependencies ) {
		if ( ( this.ran && this.isIncluded ) || this.isImportDeclaration || this.isFunctionDeclaration ) return;
		this.ran = true;

		// wk 此处的run函数就是判断下该statement是否会产生“副作用”，如果不会的话返回true
		if ( run( this.node, this.scope, this, strongDependencies, false ) ) {
			// wk 如果会产生副作用的话就把这个statement mark一下(记录isIncluded = true,也就是必须要打包)
			this.mark();
			return true;
		}
	}

	source () {
		return this.module.source.slice( this.start, this.end );
	}

	toString () {
		return this.module.magicString.slice( this.start, this.end );
	}
}
