import "./polyfills/process.patch";
import "./polyfills/fs.patch";

import { createFromRealFileSystem, RealTempFile } from "pyright/packages/pyright-internal/src/common/realFileSystem";
import { PyrightFileSystem } from "pyright/packages/pyright-internal/src/pyrightFileSystem";
import { PyrightServer } from "pyright/packages/pyright-internal/src/server";
import { BrowserMessageReader, BrowserMessageWriter, createMessageConnection, DataCallback, Disposable, Event, MessageReader, PartialMessageInfo, SharedArraySenderStrategy, SharedArrayReceiverStrategy } from "vscode-languageserver/browser";
import { createConnection } from "vscode-languageserver/node";
import { Connection as NodeConnection } from "vscode-languageserver";
import { Connection as BrowserConnection } from "vscode-languageserver/browser";
// import * as BrowserFS from "browserfs";
import * as ZenFS from "@zenfs/core";
import * as fs from "fs";
import typeshedZip from "../assets/typeshed-fallback.zip";
import { Buffer } from "buffer"
import { Uri } from "pyright/packages/pyright-internal/src/common/uri/uri";
import { FileUri } from "pyright/packages/pyright-internal/src/common/uri/fileUri";
import { BaseUri } from "pyright/packages/pyright-internal/src/common/uri/baseUri";
import { _Zip as Zip } from "@zenfs/zip";
import path from "path";

async function initFs()
{
    await ZenFS.configure({
        mounts: {
            "/typeshed-fallback": {
                backend: Zip,
                data: typeshedZip,
            },
            "/tmp": ZenFS.InMemory,
        }
    });
}

async function init()
{
    await initFs();


    const reader = new BrowserMessageReader(self as any);
    const writer = new BrowserMessageWriter(self as any);

    const connection = createConnection(reader, writer, {
        cancellationStrategy: {
            sender: new SharedArraySenderStrategy(),
            receiver: new SharedArrayReceiverStrategy()
        },
    });

    postMessage("INITIALIZED");

    let server = new PyrightServer(connection, 0);

    return server;
}

init();
