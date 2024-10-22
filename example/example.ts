import * as monaco from "monaco-editor";
import {  } from "monaco-editor";
import "./style.css";
import { MonacoPyrightProvider } from "../src";

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
    const pyrightProvider = new MonacoPyrightProvider("worker.js");
    await pyrightProvider.init(monaco, {
        typeStubs: {
            "user_mod": {
                "__init__.pyi": userTypeStub
            }
        }
    });

    monaco.editor.create(document.querySelector("#editor") as HTMLElement, {
        value: exampleCode,
        language: "python",
    });
}
init();