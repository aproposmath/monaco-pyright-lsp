# Python Language Server for Monaco Editor on Browser

![GitHub License](https://img.shields.io/github/license/aproposmath/monaco-pyright-lsp)
[![Publish to npm](https://github.com/aproposmath/monaco-pyright-lsp/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/aproposmath/monaco-pyright-lsp/actions/workflows/npm-publish.yml)
![NPM Version](https://img.shields.io/npm/v/monaco-pyright-lsp)


Make a [Pyright](https://github.com/microsoft/pyright) python language server running on browser and provide language features to [Monaco Editor](https://github.com/microsoft/monaco-editor). 

Try it on browser: <https://aproposmath.github.io/monaco-pyright-lsp/>

## Features

- Auto-completion
- Function signature help
- Symbol rename
- Finding definition
- Built-in type stubs
- Syntax diagnostics

## How it works

We bundle a pyright language server into a Web Worker using webpack with a lot of polyfills to make it running on browser. 
The pyright server worker is built with pyright source code version `1.1.386` to access its internal modules.

The filesystem that pyright server required are provided by [ZenFS](https://github.com/zen-fs/core)

Thanks [Pyright Playground](https://github.com/erictraut/pyright-playground) as an example to implement language provider with `pyright` for `monaco-editor`

## Build

```
npm install

npm run build
```

## Usage

See `/examples/webpack/src/index.ts` for example.

This require a bundle tool (webpack, etc.) to distribute on web.

```shell
npm install monaco-pyright-lsp
```

```typescript
import * as monaco from "monaco-editor";
import { MonacoPyrightProvider } from "monaco-pyright-lsp";
import largeUserModStubPack from "../../typings/packed_user_mod.zip";


const userTypeStub =
    `
def user_func(a: int, b: str) -> float: ...
`;

const exampleCode =
    `from user_mod import user_func

print("Hello World!")

def add(a: int, b: float) -> float:
    return a + b

x = add(1, 2)
`;


async function init()
{
    const pyrightProvider = new MonacoPyrightProvider(undefined, {
        typeStubs: {
            "user_mod": {
                "__init__.pyi": userTypeStub
            },
            "packed_user_mod": largeUserModStubPack,
        },
    });

    await pyrightProvider.init(monaco,);


    const editorInstance = monaco.editor.create(document.querySelector("#editor") as HTMLElement, {
        value: exampleCode,
        language: "python",
    });


    await pyrightProvider.setupDiagnostics(editorInstance);
}
init();
```
