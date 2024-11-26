import * as monaco from "monaco-editor";
import { } from "monaco-editor";
import "./style.css";
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

    pyrightProvider.setupDiagnostics
}
init();