import { LspClient } from "./client";
import _monaco, { editor, Position, languages, IRange, CancellationToken, IMarkdownString } from "monaco-editor";
import { CompletionItem, CompletionItemKind, CompletionList, Definition, Hover, InsertReplaceEdit, MarkupContent, ParameterInformation, Range, SignatureHelp, SignatureInformation, Location, DocumentUri, TextDocumentEdit, AnnotatedTextEdit } from "vscode-languageserver";
import { UserFolder } from "./message";

type MonacoModule = typeof _monaco;

interface MonacoPyrightProviderFeatures
{
    hover: boolean,
    completion: boolean,
    signatureHelp: boolean,
    diagnostic: boolean,
    rename: boolean,
    findDefinition: boolean,
}

interface MonacoPyrightOptions
{
    features: Partial<MonacoPyrightProviderFeatures>,
    builtInTypeshed: boolean,
    typeStubs?: string | UserFolder,
}

const defaultOptions: MonacoPyrightOptions = {
    features: {
        hover: true,
        completion: true,
        signatureHelp: true,
        diagnostic: true,
        rename: true,
        findDefinition: true,
    },
    builtInTypeshed: true,
    typeStubs: undefined,
};

export class MonacoPyrightProvider
{
    lspClient: LspClient;


    public constructor(workerUrl: string)
    { 
        this.lspClient = new LspClient(workerUrl);
    }

    async init(monacoModule: MonacoModule, options?: Partial<MonacoPyrightOptions>)
    {
        const finalOptions = Object.assign(defaultOptions, options || {});

        let typeStubsFolder: UserFolder = {};
        if (typeof (options?.typeStubs) === "string")
        {
            typeStubsFolder["user_types.pyi"] = options.typeStubs;
        }
        else if (typeof (options?.typeStubs) === "object")
        {
            typeStubsFolder = options.typeStubs;
        }

        await this.lspClient.initialize("/", typeStubsFolder);
        await this.lspClient.updateSettings();

        if (finalOptions.features.hover)
        {
            monacoModule.languages.registerHoverProvider('python', {
                provideHover: this.onHover.bind(this),
            });
        }

        if (finalOptions.features.completion)
        {
            monacoModule.languages.registerCompletionItemProvider('python', {
                provideCompletionItems: this.onCompletionRequest.bind(this),
                resolveCompletionItem: this.onResolveCompletion.bind(this),
                triggerCharacters: ['.', '[', '"', "'"],
            });
        }

        if (finalOptions.features.signatureHelp)
        {
            monacoModule.languages.registerSignatureHelpProvider('python', {
                provideSignatureHelp: this.onSignatureHelp.bind(this),
                signatureHelpTriggerCharacters: ['(', ','],
            });
        }
        
        if (finalOptions.features.findDefinition)
        {
            monacoModule.languages.registerDefinitionProvider('python', {
                provideDefinition: this.provideDefinition.bind(this),
            });
        }

        if (finalOptions.features.rename)
        {
            monacoModule.languages.registerRenameProvider('python', {
                provideRenameEdits: this.provideRenameEdits.bind(this),
                resolveRenameLocation: this.resolveRename.bind(this)
            });   
        }

    }

    async provideRenameEdits(model: editor.ITextModel, position: Position, newName: string, token: CancellationToken): Promise<languages.WorkspaceEdit & languages.Rejection | null>
    {
        const results = await this.lspClient.rename(model.getValue(), this.convertLspPosition(position), newName);

        console.log("rename", results)

        if (!results)
            return null;

        if (results.documentChanges)
        {
            return {
                edits: results.documentChanges.filter(docChange => (docChange as TextDocumentEdit).textDocument?.uri === LspClient.docUri)
                    .map(edit => edit as TextDocumentEdit)
                    .flatMap(edit => edit.edits)
                    .map(edit => ({
                        resource: model.uri,
                        textEdit: {
                            range: this.convertRange(edit.range),
                            text: edit.newText,
                        },
                        versionId: undefined,
                    }))
            };
        }

        return null;
    }

    async resolveRename(model: editor.ITextModel, position: Position, token: CancellationToken): Promise<languages.RenameLocation | null>
    {
        // Just use default behaviour
        return null;

        type DefaultBehavior = {
            defaultBehavior: boolean;
        };
        type RangeWithPlaceHolder = {
            range: Range;
            placeholder: string;
        };
        const results = await this.lspClient.parepareRename(model.getValue(), this.convertLspPosition(position));
        console.log("rename request", results);

        if (!results)
            return null;

        if ((results as DefaultBehavior).defaultBehavior)
        {
            return null;
        }

        if ((results as RangeWithPlaceHolder).range)
        {
            return {
                range: this.convertRange((results as RangeWithPlaceHolder).range),
                text: (results as RangeWithPlaceHolder).placeholder,
            }
        }

        if ((results as Range).start)
        {
            return {
                range: this.convertRange(results as Range),
                text: ""
            }
        }

        return null;
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
    ): Promise<languages.SignatureHelpResult | null>
    {
        const sigInfo = await this.lspClient.getSignatureHelp(model.getValue(), {
            line: position.lineNumber - 1,
            character: position.column - 1,
        });

        if (!sigInfo)
            return null;


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
    ): Promise<languages.Hover | null>
    {
        const hoverInfo = await this.lspClient.getHoverInfo(model.getValue(), {
            line: position.lineNumber - 1,
            character: position.column - 1,
        });

        if (!hoverInfo)
            return null;

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

    convertLspPosition(position: Position)
    {
        return {
            line: position.lineNumber - 1,
            character: position.column - 1,
        };
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