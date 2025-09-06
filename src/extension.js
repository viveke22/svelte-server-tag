const vscode = require('vscode');

function activate(context) {
    console.log('Svelte Server Tags extension is now active!');
    
    // Register a completion item provider for svelte files
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        'svelte',
        new ServerTagCompletionProvider(),
        '<', '>'
    );
    
    // Register hover provider for server tags
    const hoverProvider = vscode.languages.registerHoverProvider(
        'svelte',
        new ServerTagHoverProvider()
    );
    
    // Register document symbol provider
    const symbolProvider = vscode.languages.registerDocumentSymbolProvider(
        'svelte',
        new ServerTagSymbolProvider()
    );
    
    context.subscriptions.push(completionProvider, hoverProvider, symbolProvider);
    
    // Create virtual documents for server tag content
    const virtualDocumentProvider = new ServerTagVirtualDocumentProvider();
    const virtualDocumentDisposable = vscode.workspace.registerTextDocumentContentProvider(
        'svelte-server',
        virtualDocumentProvider
    );
    
    context.subscriptions.push(virtualDocumentDisposable);
    
    // Watch for changes in svelte files
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.svelte');
    watcher.onDidChange(uri => {
        virtualDocumentProvider.onDidChangeEmitter.fire(
            vscode.Uri.parse(`svelte-server:${uri.path}`)
        );
    });
    
    context.subscriptions.push(watcher);
}

class ServerTagCompletionProvider {
    provideCompletionItems(document, position) {
        const lineText = document.lineAt(position).text;
        const linePrefix = lineText.substring(0, position.character);
        
        if (linePrefix.endsWith('<ser')) {
            const serverTagCompletion = new vscode.CompletionItem(
                'server',
                vscode.CompletionItemKind.Snippet
            );
            serverTagCompletion.insertText = new vscode.SnippetString(
                'server>\n\timport { json } from \'@sveltejs/kit\';\n\n\texport async function GET() {\n\t\treturn json({ message: \'Hello from server!\' });\n\t}\n</'
            );
            serverTagCompletion.documentation = new vscode.MarkdownString(
                'Create a server-side endpoint that will be extracted to +server.js'
            );
            
            return [serverTagCompletion];
        }
        
        // Check if we're inside a server tag
        const text = document.getText();
        const currentOffset = document.offsetAt(position);
        const serverTagRegex = /<server>([\s\S]*?)<\/server>/g;
        let match;
        
        while ((match = serverTagRegex.exec(text)) !== null) {
            const startOffset = match.index + '<server>'.length;
            const endOffset = match.index + match[0].length - '</server>'.length;
            
            if (currentOffset >= startOffset && currentOffset <= endOffset) {
                // We're inside a server tag, provide JavaScript completions
                return this.getServerTagCompletions();
            }
        }
        
        return [];
    }
    
    getServerTagCompletions() {
        const completions = [];
        
        // SvelteKit specific completions
        const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
        methods.forEach(method => {
            const completion = new vscode.CompletionItem(
                `export async function ${method}`,
                vscode.CompletionItemKind.Function
            );
            completion.insertText = new vscode.SnippetString(
                `export async function ${method}(${method === 'GET' ? '' : '{ request }'}) {\n\t$0\n\treturn json({ });\n}`
            );
            completion.documentation = new vscode.MarkdownString(
                `Create a ${method} handler for this endpoint`
            );
            completions.push(completion);
        });
        
        // Import completions
        const importCompletion = new vscode.CompletionItem(
            'import { json }',
            vscode.CompletionItemKind.Module
        );
        importCompletion.insertText = new vscode.SnippetString(
            "import { json } from '@sveltejs/kit';"
        );
        completions.push(importCompletion);
        
        return completions;
    }
}

class ServerTagHoverProvider {
    provideHover(document, position) {
        const text = document.getText();
        const currentOffset = document.offsetAt(position);
        const serverTagRegex = /<server>([\s\S]*?)<\/server>/g;
        let match;
        
        while ((match = serverTagRegex.exec(text)) !== null) {
            const startOffset = match.index;
            const endOffset = match.index + match[0].length;
            
            if (currentOffset >= startOffset && currentOffset <= endOffset) {
                return new vscode.Hover(
                    new vscode.MarkdownString(
                        '**Server Tag**\n\nThis code will be extracted to a `+server.js` file and run on the server.'
                    )
                );
            }
        }
        
        return undefined;
    }
}

class ServerTagSymbolProvider {
    provideDocumentSymbols(document) {
        const symbols = [];
        const text = document.getText();
        const serverTagRegex = /<server>([\s\S]*?)<\/server>/g;
        let match;
        
        while ((match = serverTagRegex.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);
            
            const symbol = new vscode.DocumentSymbol(
                'Server Block',
                'Contains server-side code',
                vscode.SymbolKind.Module,
                range,
                range
            );
            
            // Extract function exports from server block
            const serverContent = match[1];
            const functionRegex = /export\s+async\s+function\s+(\w+)/g;
            let funcMatch;
            
            while ((funcMatch = functionRegex.exec(serverContent)) !== null) {
                const funcStartOffset = match.index + '<server>'.length + funcMatch.index;
                const funcStartPos = document.positionAt(funcStartOffset);
                const funcEndPos = document.positionAt(funcStartOffset + funcMatch[0].length);
                const funcRange = new vscode.Range(funcStartPos, funcEndPos);
                
                const funcSymbol = new vscode.DocumentSymbol(
                    funcMatch[1],
                    'HTTP Handler',
                    vscode.SymbolKind.Function,
                    funcRange,
                    funcRange
                );
                
                symbol.children.push(funcSymbol);
            }
            
            symbols.push(symbol);
        }
        
        return symbols;
    }
}

class ServerTagVirtualDocumentProvider {
    constructor() {
        this.onDidChangeEmitter = new vscode.EventEmitter();
        this.onDidChange = this.onDidChangeEmitter.event;
    }
    
    provideTextDocumentContent(uri) {
        const originalPath = uri.path;
        
        try {
            const document = vscode.workspace.textDocuments.find(
                doc => doc.uri.path === originalPath
            );
            
            if (!document) {
                return '';
            }
            
            const text = document.getText();
            const serverTagRegex = /<server>([\s\S]*?)<\/server>/g;
            let match;
            let serverContent = '';
            
            while ((match = serverTagRegex.exec(text)) !== null) {
                serverContent += match[1] + '\n\n';
            }
            
            return serverContent || '// No server tags found';
        } catch (error) {
            return '// Error reading file';
        }
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
