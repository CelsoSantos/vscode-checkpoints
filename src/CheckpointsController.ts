import {
	TextEditor,
	window,
	ExtensionContext,
	commands,
	Position,
	Range,
	MessageItem,
	workspace,
} from 'vscode';
import { CheckpointsModel } from './CheckpointsModel';
import { CheckpointsTreeView } from './CheckpointsTreeView';
import { CheckpointsDocumentView } from './CheckpointsDocumentView';

export class CheckpointsController {
	private activeEditor: TextEditor;

	constructor(
		private context: ExtensionContext,
		private model: CheckpointsModel,
		private treeView: CheckpointsTreeView,
		private documentView: CheckpointsDocumentView,
	) {}

	public initialize() {
		this.activeEditor = window.activeTextEditor;
		if (!this.activeEditor) {
			return;
		}

		// initial selection of slot context.
		this.model.checkpointContext = this.activeEditor.document.fileName;

		// Update the active editor on when it changes
		this.context.subscriptions.push(
			window.onDidChangeActiveTextEditor(
				editor => {
					this.activeEditor = editor;
					this.model.checkpointContext = this.activeEditor.document.fileName;
				},
				null,
				this.context.subscriptions,
			),
		);

		this.context.subscriptions.push(
			window.registerTreeDataProvider('checkpointsTreeView', this.treeView),
		);

		this.context.subscriptions.push(
			workspace.registerTextDocumentContentProvider('checkpointsDocumentView',
				this.documentView,
			),
		);

		// Register commands
		// =================

		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.addCheckpoint', () => {
				this.model.add(this.activeEditor.document);
			}),
		);

		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.refresh', () => {
				this.treeView.refresh();
			}),
		);

		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.deleteCheckpoint', checkpointNode => {
				this.promptAreYouSure(`Are you sure you want to delete checkpoint '${checkpointNode.label}'?`,
					() => {
						this.model.remove(checkpointNode.nodeId);
					},
				);
			}),
		);

		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.clearFile', checkpointNode => {
				this.promptAreYouSure(`Are you sure you want to clear all checkpoints from file '${checkpointNode.nodeId}'?`,
					() => {
						this.model.remove(checkpointNode.nodeId);
					},
				);
			}),
		);

		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.clearAll', () => {
				this.promptAreYouSure(`Are you sure you want to clear ALL checkpoints?`, () => {
					this.model.remove();
				});
			}),
		);

		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.diffToCurrent', checkpointNode => {
				this.documentView.showDiff(this.activeEditor.document.uri, checkpointNode.nodeId);
			}),
		);

		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.restoreCheckpoint', this.onRestoreCheckpoint, this),
		);
		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.openFile', this.onOpenFile, this),
		);
		this.context.subscriptions.push(
			commands.registerCommand('checkpoints.renameCheckpoint', this.onRenameCheckpoint, this),
		);
	}

	/**
	 * Get the checkpoints saved document and replaces the text in the editor
	 * @param checkpointNode checkpoint node from the tree view
	 */
	private onRestoreCheckpoint(checkpointNode) {
		console.log(
			`Restoring checkpoint: '${checkpointNode.label}', with id: '${checkpointNode.nodeId}'`,
		);

		//Currently, you can only restore checkpoints if it comes from the currently active document.
		if (checkpointNode.parentId !== this.model.checkpointContext) {
			console.error(
				`Failed to restore checkpoint to file '${this.model.checkpointContext}'.`,
			);
			return;
		}

		this.activeEditor.edit(editorBuilder => {
			// Create a range spanning the entire content of the file
			let lastLine = this.activeEditor.document.lineAt(
				this.activeEditor.document.lineCount - 1,
			);
			let documentRange = new Range(new Position(0, 0), lastLine.rangeIncludingLineBreak.end);

			// Replace the content of the document with the text of the checkpoint.
			editorBuilder.replace(
				documentRange,
				this.model.getCheckpoint(checkpointNode.nodeId).text,
			);
		});
	};

	/**
	 * Opens the current file of the checkpoint.
	 * @param checkpointNode checkpoint node from the tree view
	 */
	private onOpenFile(checkpointNode) {
		console.log(`Opening file: '${checkpointNode.nodeId}'`);

		workspace.openTextDocument(checkpointNode.nodeId).then(
			// On success:
			textDocument => {
				window.showTextDocument(textDocument, {
					preserveFocus: false,
					preview: true,
				});
			},
			// on failure:
			error => {
				window.showErrorMessage(`Cannot open file ${checkpointNode.nodeId}.`);
				console.error(error.message);
			},
		);
	};

	/**
	 * Opens a input dialog to request a new name for a checkpoint and
	 * updates the model.
	 * @param checkpointNode checkpoint node from the tree view
	 */
	private onRenameCheckpoint(checkpointNode) {
		console.log(`Rename checkpoint command invoked on checkpoint: '${checkpointNode.label}'`);

		window
			.showInputBox({
				ignoreFocusOut: true,
				prompt: 'Type in a new name for the checkpoint.',
				value: checkpointNode.label,
				valueSelection: undefined,
			})
			.then(result => {
				if (result === undefined) {
					console.log(`Rename checkpoint canceled`);
					return;
				}

				if (result === checkpointNode.label) {
					console.log(`Checkpoint name is the same as before, returning.`);
					return;
				}

				this.model.renameCheckpoint(checkpointNode.nodeId, result);
			});
    };

	/**
	 * Prompt the user with a modal before performing an action
	 * @param message Message to ask the user (yes/no question)
	 * @param cb Callback that will be called if answer is yes
	 */
	private promptAreYouSure(message: string, cb) {
		window
			.showWarningMessage<MessageItem>(
				message,
				{ modal: true },
				{ title: 'Yes', isCloseAffordance: false },
				{ title: 'No', isCloseAffordance: true },
			)
			.then(answer => {
				if (answer.title === 'Yes') {
					cb();
				}
			});
	}
}