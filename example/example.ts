import * as monaco from "monaco-editor";
import {  } from "monaco-editor";
import "./style.css";
import { LspClient } from "../src/index";
import { CompletionItem, CompletionItemKind, CompletionList, Hover, InsertReplaceEdit, MarkupContent, ParameterInformation, Range, SignatureHelp, SignatureInformation } from "vscode-languageserver";



const lspClient = new LspClient('worker.js');
// lspClient.initialize("/");

async function init()
{
    console.log("initialize");
    await lspClient.initialize("/");
    console.log("client initialized")

    await lspClient.updateSettings();

    monaco.languages.registerHoverProvider('python', {
        provideHover: handleHoverRequest,
    });

    monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: handleProvideCompletionRequest,
        resolveCompletionItem: handleResolveCompletionRequest,
        triggerCharacters: ['.', '[', '"', "'"],
    });

    monaco.languages.registerSignatureHelpProvider('python', {
        provideSignatureHelp: handleSignatureHelpRequest,
        signatureHelpTriggerCharacters: ['(', ','],
    });



    monaco.editor.create(document.querySelector("#editor") as HTMLElement, {
        value: 'print("Hello World!")\ndef add(a: int, b: float) -> float: \n    return a + b\nx = add(1, 2)',
        language: "python",
    });
}
init();


async function handleSignatureHelpRequest(
    model: monaco.editor.ITextModel,
    position: monaco.Position
): Promise<monaco.languages.SignatureHelpResult>
{
    if (!lspClient)
    {
        return null as any;
    }

    try
    {
        const sigInfo = await lspClient.getSignatureHelp(model.getValue(), {
            line: position.lineNumber - 1,
            character: position.column - 1,
        }) as SignatureHelp;

        return {
            value: {
                signatures: sigInfo.signatures.map((sig) =>
                {
                    return {
                        label: sig.label,
                        documentation: sig.documentation,
                        parameters: sig.parameters as ParameterInformation[],
                        activeParameter: sig.activeParameter as number,
                    };
                }),
                activeSignature: sigInfo.activeSignature as number,
                activeParameter: sigInfo.activeParameter as number,
            },
            dispose: () => { },
        };
    } catch (err)
    {
        return null as any;
    }
}

async function handleHoverRequest(
    model: monaco.editor.ITextModel,
    position: monaco.Position
): Promise<monaco.languages.Hover>
{
    if (!lspClient)
    {
        return null as any;
    }

    try
    {
        const hoverInfo = await lspClient.getHoverInfo(model.getValue(), {
            line: position.lineNumber - 1,
            character: position.column - 1,
        }) as Hover;

        return {
            contents: [
                {
                    value: (hoverInfo.contents as MarkupContent).value,
                },
            ],
            range: convertRange(hoverInfo.range as Range),
        };
    } catch (err)
    {
        return null as any;
    }
}

async function handleProvideCompletionRequest(
    model: monaco.editor.ITextModel,
    position: monaco.Position
): Promise<monaco.languages.CompletionList>
{
    try
    {
        const completionInfo = await lspClient.getCompletion(model.getValue(), {
            line: position.lineNumber - 1,
            character: position.column - 1,
        }) as CompletionList;

        console.log(completionInfo);

        return {
            suggestions: completionInfo.items.map((item) =>
            {
                return convertCompletionItem(item, model);
            }),
            incomplete: completionInfo.isIncomplete,
            dispose: () => { },
        } as any;
    } catch (err)
    {
        return null as any;
    }
}

async function handleResolveCompletionRequest(
    item: monaco.languages.CompletionItem
): Promise<monaco.languages.CompletionItem>
{
    const model = (item as any).model as monaco.editor.ITextModel | undefined;
    const original = (item as any).__original as CompletionItem | undefined;
    if (!model || !original)
    {
        return null as any;
    }

    if (!lspClient)
    {
        return null as any;
    }

    try
    {
        const result = await lspClient.resolveCompletion(original);
        return convertCompletionItem(result as CompletionItem);
    } catch (err)
    {
        return null as any;
    }
}

function convertCompletionItem(
    item: CompletionItem,
    model?: monaco.editor.ITextModel
): monaco.languages.CompletionItem
{
    const converted: monaco.languages.CompletionItem = {
        label: item.label,
        kind: convertCompletionItemKind(item.kind as CompletionItemKind),
        tags: item.tags,
        detail: item.detail,
        documentation: item.documentation,
        sortText: item.sortText,
        filterText: item.filterText,
        preselect: item.preselect,
        insertText: item.label,
        range: undefined as any,
    };

    if (item.textEdit)
    {
        converted.insertText = item.textEdit.newText;
        if (InsertReplaceEdit.is(item.textEdit))
        {
            converted.range = {
                insert: convertRange(item.textEdit.insert),
                replace: convertRange(item.textEdit.replace),
            };
        } else
        {
            converted.range = convertRange(item.textEdit.range);
        }
    }

    if (item.additionalTextEdits)
    {
        converted.additionalTextEdits = item.additionalTextEdits.map((edit) =>
        {
            return {
                range: convertRange(edit.range),
                text: edit.newText,
            };
        });
    }

    // Stash a few additional pieces of information.
    (converted as any).__original = item;
    if (model)
    {
        (converted as any).model = model;
    }

    return converted;
}

function convertRange(range: Range): monaco.IRange
{
    return {
        startLineNumber: range.start.line + 1,
        startColumn: range.start.character + 1,
        endLineNumber: range.end.line + 1,
        endColumn: range.end.character + 1,
    };
}


function convertCompletionItemKind(
    itemKind: CompletionItemKind
): monaco.languages.CompletionItemKind
{
    switch (itemKind)
    {
        case CompletionItemKind.Constant:
            return monaco.languages.CompletionItemKind.Constant;

        case CompletionItemKind.Variable:
            return monaco.languages.CompletionItemKind.Variable;

        case CompletionItemKind.Function:
            return monaco.languages.CompletionItemKind.Function;

        case CompletionItemKind.Field:
            return monaco.languages.CompletionItemKind.Field;

        case CompletionItemKind.Keyword:
            return monaco.languages.CompletionItemKind.Keyword;

        default:
            return monaco.languages.CompletionItemKind.Reference;
    }
}
