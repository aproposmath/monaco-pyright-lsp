import * as monaco from "monaco-editor";
import "./style.css";

monaco.editor.create(document.querySelector("#editor") as HTMLElement, {
    value: 'print("Hello World!")\n',
    language: "python",
});