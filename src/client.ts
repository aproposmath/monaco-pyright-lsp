import { } from "pyright/packages/pyright-internal/src/server";
import { BrowserMessageReader, BrowserMessageWriter, createMessageConnection, DataCallback, Disposable, Event, MessageReader, PartialMessageInfo, SharedArraySenderStrategy, SharedArrayReceiverStrategy, MessageConnection, CompletionList, CompletionItem, NotificationType, DidChangeTextDocumentParams, CompletionParams, Position, CompletionRequest, CompletionResolveRequest, InitializeParams, DiagnosticTag, InitializeRequest, DidChangeConfigurationParams, DidOpenTextDocumentParams, PublishDiagnosticsParams, Diagnostic, LogMessageParams, ConfigurationParams, RequestType, HoverParams, HoverRequest, SignatureHelpParams, SignatureHelpRequest, SignatureHelp, Hover, DidChangeConfigurationNotification } from "vscode-languageserver/browser";


declare global
{
    interface Promise<T>
    {
        ignoreErrors(): void
    }
}


const documentUri = 'file:///Untitled.py';

interface DiagnosticRequest
{
    callback: (diags: Diagnostic[], error?: Error) => void;
}

export class LspClient
{
    connection: MessageConnection = null as any;
    docVersion = 1;
    lastDoc = "";
    worker: Worker;
    workerInitPromise: Promise<void>;
    private _documentDiags: PublishDiagnosticsParams | undefined;
    private _pendingDiagRequests = new Map<number, DiagnosticRequest[]>();

    constructor(worker_url: string)
    {
        this.worker = new Worker(worker_url);
        this.workerInitPromise = new Promise((resolve) =>
        {
            this.worker.onmessage = (msg) =>
            {
                if (msg.data === "INITIALIZED")
                {
                    resolve();
                }
            }
        })
    }
    
    public async initialize(projectPath: string)
    {
        await this.workerInitPromise;

        const reader = new BrowserMessageReader(this.worker);
        const writer = new BrowserMessageWriter(this.worker);

        this.connection = createMessageConnection(reader, writer, console, {
            // cancellationStrategy: {
            //     sender: new SharedArraySenderStrategy(),
            //     receiver: new SharedArrayReceiverStrategy()
            // }
        });

        this.connection.listen();
        // Initialize the server.
        const init: InitializeParams = {
            rootUri: `file://${projectPath}`,
            rootPath: projectPath,
            processId: 1,
            capabilities: {
                textDocument: {
                    publishDiagnostics: {
                        tagSupport: {
                            valueSet: [DiagnosticTag.Unnecessary, DiagnosticTag.Deprecated],
                        },
                        versionSupport: true,
                    },
                    hover: {
                        contentFormat: ['markdown', 'plaintext'],
                    },
                    signatureHelp: {},
                },
            },
        };


        this.docVersion = 1;
        this.lastDoc = "";

        await this.connection.sendRequest(InitializeRequest.type, init);

        // Update the settings.
        await this.connection.sendNotification(
            new NotificationType<DidChangeConfigurationParams>('workspace/didChangeConfiguration'),
            {
                settings: {},
            }
        );

        // Simulate an "open file" event.
        await this.connection.sendNotification(
            new NotificationType<DidOpenTextDocumentParams>('textDocument/didOpen'),
            {
                textDocument: {
                    uri: documentUri,
                    languageId: 'python',
                    version: this.docVersion,
                    text: this.lastDoc,
                },
            }
        );

        // Receive diagnostics from the language server.
        this.connection.onNotification(
            new NotificationType<PublishDiagnosticsParams>('textDocument/publishDiagnostics'),
            (diagInfo) =>
            {
                const diagVersion = diagInfo.version ?? -1;

                console.info(`Received diagnostics for version: ${diagVersion}`);

                // Update the cached diagnostics.
                if (
                    this._documentDiags === undefined ||
                    this._documentDiags.version! < diagVersion
                )
                {
                    this._documentDiags = diagInfo;
                }

                // Resolve any pending diagnostic requests.
                const pendingRequests = this._pendingDiagRequests.get(diagVersion) ?? [];
                this._pendingDiagRequests.delete(diagVersion);

                for (const request of pendingRequests)
                {
                    request.callback(diagInfo.diagnostics);
                }
            }
        );

        // Log messages received by the language server for debugging purposes.
        this.connection.onNotification(
            new NotificationType<LogMessageParams>('window/logMessage'),
            (info) =>
            {
                console.info(`Language server log message: ${info.message}`);
            }
        );

        // Handle requests for configurations.
        this.connection.onRequest(
            new RequestType<ConfigurationParams, any, any>('workspace/configuration'),
            (params) =>
            {
                console.info(`Language server config request: ${JSON.stringify(params)}}`);
                return [];
            }
        );
    }

    async getCompletion(
        code: string,
        position: Position
    ): Promise<CompletionList | CompletionItem[] | null>
    {
        let documentVersion = this.docVersion;
        if (this.lastDoc !== code)
        {
            documentVersion = await this.updateTextDocument(code);
        }

        const params: CompletionParams = {
            textDocument: {
                uri: documentUri,
            },
            position,
        };

        console.log("Request completion");

        const result = await this.connection
            .sendRequest(CompletionRequest.type, params)
            .catch((err) =>
            {
                // Don't return an error. Just return null (no info).
                return null;
            });
        
        console.log("Get result", result);

        return result;
    }

    async resolveCompletion(completionItem: CompletionItem): Promise<CompletionItem | null>
    {
        const result = await this.connection
            .sendRequest(CompletionResolveRequest.type, completionItem)
            .catch((err) =>
            {
                // Don't return an error. Just return null (no info).
                return null;
            });

        return result;
    }

    async getHoverInfo(code: string, position: Position): Promise<Hover | null>
    {
        let documentVersion = this.docVersion;
        if (this.lastDoc !== code)
        {
            documentVersion = await this.updateTextDocument(code);
        }

        const params: HoverParams = {
            textDocument: {
                uri: documentUri,
            },
            position,
        };

        const result = await this.connection
            .sendRequest(HoverRequest.type, params)
            .catch((err) =>
            {
                // Don't return an error. Just return null (no info).
                return null;
            });

        return result;
    }

    async getSignatureHelp(code: string, position: Position): Promise<SignatureHelp | null>
    {
        let documentVersion = this.docVersion;
        if (this.lastDoc !== code)
        {
            documentVersion = await this.updateTextDocument(code);
        }

        const params: SignatureHelpParams = {
            textDocument: {
                uri: documentUri,
            },
            position,
        };

        const result = await this.connection
            .sendRequest(SignatureHelpRequest.type, params)
            .catch((err) =>
            {
                // Don't return an error. Just return null (no info).
                return null;
            });
        
        console.log("signature help", result);

        return result;
    }

    async getDiagnostics(code: string): Promise<Diagnostic[]>
    {
        const codeChanged = this.lastDoc !== code;

        // If the code hasn't changed since the last time we received
        // a code update, return the cached diagnostics.
        if (!codeChanged && this._documentDiags)
        {
            return this._documentDiags.diagnostics;
        }

        // The diagnostics will come back asynchronously, so
        // return a promise.
        return new Promise<Diagnostic[]>(async (resolve, reject) =>
        {
            let documentVersion = this.docVersion;

            if (codeChanged)
            {
                documentVersion = await this.updateTextDocument(code);
            }

            // Queue a request for diagnostics.
            let requestList = this._pendingDiagRequests.get(documentVersion);
            if (!requestList)
            {
                requestList = [];
                this._pendingDiagRequests.set(documentVersion, requestList);
            }

            requestList.push({
                callback: (diagnostics, err) =>
                {
                    if (err)
                    {
                        reject(err);
                        return;
                    }

                    console.info(`Diagnostic callback ${JSON.stringify(diagnostics)}}`);
                    resolve(diagnostics);
                },
            });
        });
    }

    async updateSettings(): Promise<void>
    {
        await this.connection
            .sendNotification(DidChangeConfigurationNotification.type, {
                settings: {
                    python: {
                        analysis: {
                            typeshedPaths: [
                                "/typeshed-fallback"
                            ]
                        },
                        pythonVersion: "3.13",
                        pythonPlatform: "All",
                    }
                    }
            });
    }

    // Sends a new version of the text document to the language server.
    // It bumps the document version and returns the new version number.
    private async updateTextDocument(code: string): Promise<number>
    {
        ++this.docVersion;
        console.info(`Updating text document to version ${this.docVersion}`);

        // Send the updated text to the language server.
        return this.connection
            .sendNotification(
                new NotificationType<DidChangeTextDocumentParams>('textDocument/didChange'),
                {
                    textDocument: {
                        uri: documentUri,
                        version: this.docVersion,
                    },
                    contentChanges: [
                        {
                            text: code,
                        },
                    ],
                }
            )
            .then(() =>
            {
                console.info(`Successfully sent text document to language server`);
                return this.docVersion;
            })
            .catch((err) =>
            {
                console.error(`Error sending text document to language server: ${err}`);
                throw err;
            });
    }
}

