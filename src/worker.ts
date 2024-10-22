import "./polyfills/process.patch";
import "./polyfills/fs.patch";

import { createFromRealFileSystem, RealTempFile } from "pyright/packages/pyright-internal/src/common/realFileSystem";
import { PyrightFileSystem } from "pyright/packages/pyright-internal/src/pyrightFileSystem";
import { PyrightServer } from "pyright/packages/pyright-internal/src/server";
import { BrowserMessageReader, BrowserMessageWriter, createMessageConnection, DataCallback, Disposable, Event, MessageReader, PartialMessageInfo, SharedArraySenderStrategy, SharedArrayReceiverStrategy } from "vscode-languageserver/browser";
import { createConnection } from "vscode-languageserver/node";
import { InitializedNotification, Connection as NodeConnection } from "vscode-languageserver";
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
import { InitializeMsg, MsgInitServer, MsgServerInitialized, MsgServerLoaded, UserFolder } from "./message";

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

function createUserFiles(parentPath: string, folder: UserFolder)
{
    const zenfs = ZenFS.fs;
    (self as any).zenfs = ZenFS.fs;

    zenfs.mkdirSync(parentPath, { recursive: true });

    for (const name in folder)
    {
        if (typeof (folder[name]) === "string")
        {
            zenfs.writeFileSync(path.join(parentPath, name), folder[name], {encoding: "utf-8"});
        }
        else if (folder[name] instanceof ArrayBuffer)
        {
            zenfs.writeFileSync(path.join(parentPath, name), new DataView(folder[name]));
        }
        else
        {
            createUserFiles(path.join(parentPath, name), folder[name]);
        }
    }
}

async function handleInitServer(msg: MsgInitServer)
{
    createUserFiles("/typings", msg.userFiles);

    postMessage(<MsgServerInitialized>{
        type: "serverInitialized"
    });

    onmessage = null;

    const reader = new BrowserMessageReader(self as any);
    const writer = new BrowserMessageWriter(self as any);
    const connection = createConnection(reader, writer, {
        cancellationStrategy: {
            sender: new SharedArraySenderStrategy(),
            receiver: new SharedArrayReceiverStrategy()
        },
    });

    let server = new PyrightServer(connection, 0);

    return server;
}

async function init()
{
    await initFs();


    postMessage(<MsgServerLoaded>{
        type: "serverLoaded"
    });

    onmessage = (inMessage) =>
    {
        const msg = inMessage.data as InitializeMsg;

        switch (msg.type)
        {
            case "initServer":
                handleInitServer(msg);
                break;
        }
    }
}

init();
