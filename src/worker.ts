
import { createFromRealFileSystem, RealTempFile } from "pyright/packages/pyright-internal/src/common/realFileSystem";
import { PyrightFileSystem } from "pyright/packages/pyright-internal/src/pyrightFileSystem";
import { PyrightServer } from "pyright/packages/pyright-internal/src/server";
import { BrowserMessageReader, BrowserMessageWriter, createMessageConnection, DataCallback, Disposable, Event, MessageReader, PartialMessageInfo, SharedArraySenderStrategy, SharedArrayReceiverStrategy } from "vscode-languageserver/browser";
import { createConnection } from "vscode-languageserver/node";
import { Connection as NodeConnection } from "vscode-languageserver";
import { Connection as BrowserConnection } from "vscode-languageserver/browser";

const reader = new BrowserMessageReader(self);
const writer = new BrowserMessageWriter(self);

const connection = createConnection(reader, writer, {
    cancellationStrategy: {
        sender: new SharedArraySenderStrategy(),
        receiver: new SharedArrayReceiverStrategy()
    },
});

const tempFile = new RealTempFile()
const tempFileSystem = new PyrightFileSystem(createFromRealFileSystem(tempFile));

let server = new PyrightServer(connection, 1, tempFileSystem);
