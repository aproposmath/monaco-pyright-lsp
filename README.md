# Pyright Language Server for Monaco Editor

Make a [Pyright](https://github.com/microsoft/pyright) language server working on browser and provide language features to [Monaco Editor](https://github.com/microsoft/monaco-editor). 

Try it online: 

## How it works

We Bundle a pyright into a Web Worker using webpack with a lot of polyfills to make it running on browser. 
The pyright server worker is built with pyright source code version `1.1.386` to access its internal modules.

The filesystem that pyright required are provided by [ZenFS](https://github.com/westerndigitalcorporation/zenfs)

Thanks [Pyright Playground](https://github.com/erictraut/pyright-playground) as a example to implement language provider with `pyright` for `monaco-editor`

## Build

```
npm install

npm run build
```

## Usage

See `/examples/webpack/src/index.ts` for example.