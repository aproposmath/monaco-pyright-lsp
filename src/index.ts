import { LspClient } from "./client";
import _monaco, { editor, Position, languages, IRange, CancellationToken } from "monaco-editor";
import { CompletionItem, CompletionItemKind, CompletionList, Definition, Hover, InsertReplaceEdit, MarkupContent, ParameterInformation, Range, SignatureHelp, SignatureInformation, Location, DocumentUri } from "vscode-languageserver";

type MonacoModule = typeof _monaco;

interface MonacoPyrightProviderOptions
{
    hover: boolean,
    completion: boolean,
    signatureHelp: boolean,
    diagnostic: boolean,
    rename: boolean,
    findDefinition: boolean,
}

const defaultOptions: MonacoPyrightProviderOptions = {
    hover: true,
    completion: true,
    signatureHelp: true,
    diagnostic: true,
    rename: true,
    findDefinition: true,

};

export class MonacoPyrightProvider
{
    lspClient: LspClient;


    public constructor(workerUrl: string)
    { 
        this.lspClient = new LspClient(workerUrl);
    }

    async init(monacoModule: MonacoModule, options?: Partial<MonacoPyrightProviderOptions>)
    {
        await this.lspClient.initialize("/");
        await this.lspClient.updateSettings();

        const finalOptions = Object.assign(defaultOptions, options || {});
        if (finalOptions.hover)
        {
            monacoModule.languages.registerHoverProvider('python', {
                provideHover: this.onHover.bind(this),
            });
        }

        if (finalOptions.completion)
        {
            monacoModule.languages.registerCompletionItemProvider('python', {
                provideCompletionItems: this.onCompletionRequest.bind(this),
                resolveCompletionItem: this.onResolveCompletion.bind(this),
                triggerCharacters: ['.', '[', '"', "'"],
            });
        }

        if (finalOptions.signatureHelp)
        {
            monacoModule.languages.registerSignatureHelpProvider('python', {
                provideSignatureHelp: this.onSignatureHelp.bind(this),
                signatureHelpTriggerCharacters: ['(', ','],
            });
        }
        
        if (finalOptions.findDefinition)
        {
            monacoModule.languages.registerDefinitionProvider('python', {
                provideDefinition: this.provideDefinition.bind(this),
            });
        }

    }

    async provideDefinition(model: editor.ITextModel, position: Position, token: CancellationToken): Promise<languages.Definition | languages.LocationLink[] | null>
    {
        const results = await this.lspClient.getDefinition(model.getValue(), {
            line: position.lineNumber - 1,
            character: position.column - 1,
        }) as Definition;

        if (!results)
            throw new Error("Invalid result");

        let location: Location;
        if (results instanceof Array)
        {
            location = results[0];
        }
        else
        {
            location = results as Location;
        }

        // We only allow getting definition inside current doc.
        if (location.uri != LspClient.docUri)
        {
            return null;
        }

        return {
            uri: model.uri,
            range: this.convertRange(location.range)
        };
    }

    async onSignatureHelp(
        model: editor.ITextModel,
        position: Position
    ): Promise<languages.SignatureHelpResult>
    {
        const sigInfo = await this.lspClient.getSignatureHelp(model.getValue(), {
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
    }

    async onHover(
        model: editor.ITextModel,
        position: Position
    ): Promise<languages.Hover>
    {
        const hoverInfo = await this.lspClient.getHoverInfo(model.getValue(), {
            line: position.lineNumber - 1,
            character: position.column - 1,
        }) as Hover;

        return {
            contents: [
                {
                    value: (hoverInfo.contents as MarkupContent).value,
                },
            ],
            range: this.convertRange(hoverInfo.range as Range),
        };
    }

    async onCompletionRequest(
        model: editor.ITextModel,
        position: Position
    ): Promise<languages.CompletionList>
    {
        const completionInfo = await this.lspClient.getCompletion(model.getValue(), {
            line: position.lineNumber - 1,
            character: position.column - 1,
        }) as CompletionList;

        console.log(completionInfo);

        return {
            suggestions: completionInfo.items.map((item) =>
            {
                return this.convertCompletionItem(item, model);
            }),
            incomplete: completionInfo.isIncomplete,
            dispose: () => { },
        };
    }

    async onResolveCompletion(
        item: languages.CompletionItem
    ): Promise<languages.CompletionItem>
    {
        const model = (item as ExtendedCompletionItem).__model;
        const original = (item as ExtendedCompletionItem).__original;

        if (!model || !original)
        {
            return null as any;
        }

        const result = await this.lspClient.resolveCompletion(original);
        return this.convertCompletionItem(result as CompletionItem);
    }

    convertCompletionItem(
        item: CompletionItem,
        model?: editor.ITextModel
    ): languages.CompletionItem
    {
        const converted: languages.CompletionItem = {
            label: item.label,
            kind: this.convertCompletionItemKind(item.kind as CompletionItemKind),
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
                    insert: this.convertRange(item.textEdit.insert),
                    replace: this.convertRange(item.textEdit.replace),
                };
            }
            else
            {
                converted.range = this.convertRange(item.textEdit.range);
            }
        }

        if (item.additionalTextEdits)
        {
            converted.additionalTextEdits = item.additionalTextEdits.map((edit) =>
            {
                return {
                    range: this.convertRange(edit.range),
                    text: edit.newText,
                };
            });
        }

        // Stash a few additional pieces of information.
        (converted as ExtendedCompletionItem).__original = item;
        if (model)
        {
            (converted as ExtendedCompletionItem).__model = model;
        }

        return converted;
    }

    convertRange(range: Range): IRange
    {
        return {
            startLineNumber: range.start.line + 1,
            startColumn: range.start.character + 1,
            endLineNumber: range.end.line + 1,
            endColumn: range.end.character + 1,
        };
    }


    convertCompletionItemKind(
        itemKind: CompletionItemKind
    ): languages.CompletionItemKind
    {
        switch (itemKind)
        {
            case CompletionItemKind.Constant:
                return languages.CompletionItemKind.Constant;

            case CompletionItemKind.Variable:
                return languages.CompletionItemKind.Variable;

            case CompletionItemKind.Function:
                return languages.CompletionItemKind.Function;

            case CompletionItemKind.Field:
                return languages.CompletionItemKind.Field;

            case CompletionItemKind.Keyword:
                return languages.CompletionItemKind.Keyword;

            default:
                return languages.CompletionItemKind.Reference;
        }
    }

}

interface ExtendedCompletionItem extends CompletionItem
{
    __original?: CompletionItem,
    __model?: editor.ITextModel,
}