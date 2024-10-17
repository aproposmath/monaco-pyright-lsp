
import { createFromRealFileSystem, RealTempFile } from "pyright/packages/pyright-internal/src/common/realFileSystem";
import { PyrightFileSystem } from "pyright/packages/pyright-internal/src/pyrightFileSystem";
import { PyrightServer } from "pyright/packages/pyright-internal/src/server";
import { BrowserMessageReader, BrowserMessageWriter, createMessageConnection, DataCallback, Disposable, Event, MessageReader, PartialMessageInfo, SharedArraySenderStrategy, SharedArrayReceiverStrategy } from "vscode-languageserver/browser";
import { createConnection } from "vscode-languageserver/node";
import { Connection as NodeConnection } from "vscode-languageserver";
import { Connection as BrowserConnection } from "vscode-languageserver/browser";
import * as BrowserFS from "browserfs";
import * as fs from "fs";
import typeshedZip from "../assets/typeshed-fallback.zip";
import { Buffer } from "buffer"
import { Uri } from "pyright/packages/pyright-internal/src/common/uri/uri";
import { FileUri } from "pyright/packages/pyright-internal/src/common/uri/fileUri";
import { BaseUri } from "pyright/packages/pyright-internal/src/common/uri/baseUri";
import path from "path";

function initFs()
{
    return new Promise<void>((resolve, reject) =>
    {
        BrowserFS.configure({
            fs: "MountableFileSystem",
            options: {
                "/typeshed-fallback": {
                    fs: "ZipFS",
                    options: {
                        // Wrap as Buffer object.
                        zipData: Buffer.from(typeshedZip)
                    }
                },
                "/tmp": { fs: "InMemory" },
                "/venv": { fs: "InMemory" },
                // "/home": { fs: "IndexedDB" }
            }
        }, function (e)
        {
            if (e)
            {
                reject(e);
                return;
            }
            resolve();

            // Otherwise, BrowserFS is ready to use!
        });
    });
}

async function init()
{
    await initFs();

    const venvPath = path.join("/", 'venv', 'lib', 'site-packages');
    fs.mkdirSync("/venv/lib");
    fs.mkdirSync(venvPath, { recursive: true });

    const configFilePath = path.join("/", 'pyrightconfig.json');
    const config: any = {};

    config.pythonVersion = "3.13";

    config.pythonPlatform = "All";

    config.typeCheckingMode = 'strict';

    // Set the venvPath to a synthesized venv to prevent pyright from
    // trying to resolve imports using the default Python environment
    // installed on the server's docker container.
    config.venvPath = '.';
    config.venv = 'venv';

    const configJson = JSON.stringify(config);
    // fs.writeFileSync(configFilePath, configJson);

    console.log(fs.readdirSync("."));

    // setInterval(() => {
    //     console.log(fs.readdirSync("/"));
    // }, 1000);


    const reader = new BrowserMessageReader(self as any);
    const writer = new BrowserMessageWriter(self as any);

    const connection = createConnection(reader, writer, {
        cancellationStrategy: {
            sender: new SharedArraySenderStrategy(),
            receiver: new SharedArrayReceiverStrategy()
        },
    });

    postMessage("INITIALIZED");

    const tempFile = new RealTempFile()
    const fileSys = createFromRealFileSystem(tempFile);
    const tempFileSystem = new PyrightFileSystem(fileSys);
    const url = tempFileSystem.getModulePath();

    // console.log(tempFileSystem.readdirSync(FileUri.createFileUri()));

    let server = new PyrightServer(connection, 0);

    return server;
}

init();
