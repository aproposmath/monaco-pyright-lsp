import * as monaco from "monaco-editor";
import {  } from "monaco-editor";
import "./style.css";
import { MonacoPyrightProvider } from "../src";

async function init()
{
    const pyrightProvider = new MonacoPyrightProvider("worker.js");
    await pyrightProvider.init(monaco);

    monaco.editor.create(document.querySelector("#editor") as HTMLElement, {
        value: 'print("Hello World!")\ndef add(a: int, b: float) -> float: \n    return a + b\nx = add(1, 2)',
        language: "python",
    });
}
init();
