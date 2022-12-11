# rollup

## 最新
最近写了篇文章[构建过程：从源码到dist文件](https://juejin.cn/post/7175847933252730938),可以先看这里，比下面之前记录的要详细一点


## 前言
1. rollup当前的分支代码实在太多了，看到一半思路断了，然后切回rollup-init分支，看下最初的代码实现，理清整体思路
2. 这里的文件都是复制的部分源码
3. 主要是理清一下rollup的整体打包思路，关于细节如做ast解析等等不在本次关注范围


## 阅读分支
[rollup-init](https://github.com/rollup/rollup/tree/rollup-init)

## 笔记

bundle.build

1. `resolveId` 就是将一个文件处理为一个id
```
...
		return this.resolveId( this.entry, undefined )
			.then( id => {
				if ( id == null ) throw new Error( `Could not resolve entry (${this.entry})` );
				this.entryId = id;
				return this.fetchModule( id, undefined );
			})
...
```
2. `fetchModule` 
2.1 `load` 方法获取resolveId中的id对应的文件
2.2 `transform`对load中读取的文件进行一些处理
2.3 `new Module()`把读取的文件变为一个Module实例
3. `new Module` 内容
3.1 ast解析
3.2 ast分析，记录import  export内容(将该module依赖的模块和暴露出去的模块记录下来)
```
addImport()
addExport()
```
4. `fetchAllDependencies`将module依赖的模块挨个进行`fetchModule`，循环以上步骤，将所有module都进行了解析并记录下来了，到此为止所有需要的文件（module）就都记录下来了，接下来就是一些细节的完善（比如进行tree shaking 、防止模块明明重复）等等，

generate()/write()方法就是把bundle进行打包

### v2
要做一次rollup构建流程的分享，再次看了看代码，有了些新的认识
《从一个字符串到静态资源的过程》
string   'src/main.js'
ID "/Users/sftc/test/myrollup/src/main.js"
js对象 module = new Module()
根据ast分析的结果递归的找到所有的文件
[module1, module2]

第二阶段：module之间建立链接
1. 作用：完善模块之间的依赖关系，之前只是根据import  export * from 'xx.js'找的，依赖关系不够
2. 也是做tree shaking的基础