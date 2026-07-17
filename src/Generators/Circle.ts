import { GeneratorInterface2D, Bounds } from "./GeneratorInterface2D";
import { ControlAwareInterface, makeInputControl, makeSegmentedControl, Control } from "../Controller";
import { distance } from "../Math";
import { EventEmitter } from "../EventEmitter";
import { NeverError } from "../Errors";

export enum CircleModes {
	thick = 'thick',
	thin = 'thin',
	filled = 'filled',
}

function filled(x: number, y: number, radius: number, ratio: number): boolean {
	return distance(x, y, ratio) <= radius;
}

function fatfilled(x: number, y: number, radius: number, ratio: number): boolean {
	return filled(x, y, radius, ratio) && !(
		filled(x + 1, y, radius, ratio) &&
		filled(x - 1, y, radius, ratio) &&
		filled(x, y + 1, radius, ratio) &&
		filled(x, y - 1, radius, ratio) &&
		filled(x + 1, y + 1, radius, ratio) &&
		filled(x + 1, y - 1, radius, ratio) &&
		filled(x - 1, y - 1, radius, ratio) &&
		filled(x - 1, y + 1, radius, ratio)
	);
}

function thinfilled(x: number, y: number, radius: number, ratio: number): boolean {
	return filled(x, y, radius, ratio) && !(
		filled(x + 1, y, radius, ratio) &&
		filled(x - 1, y, radius, ratio) &&
		filled(x, y + 1, radius, ratio) &&
		filled(x, y - 1, radius, ratio)
	);
}

interface CircleState {
	mode: CircleModes;
	width: number;
	height: number;
	ratioWidth: number;
	ratioHeight: number;
}

export class Circle implements GeneratorInterface2D, ControlAwareInterface {

	private modeControl: Control<HTMLElement>;

	public readonly changeEmitter = new EventEmitter<{ event: string, state: CircleState }>();

	private widthControl: Control<HTMLInputElement>;
	private heightControl: Control<HTMLInputElement>;
	private aspectRatioControl: Control<HTMLElement>;
	private maxBlocksControl: Control<HTMLInputElement>;

	constructor(
		private width: number,
		private height: number,
		private mode : CircleModes,
		private ratioWidth: number,
		private ratioHeight: number,
	) {

		this.modeControl = makeSegmentedControl('Settings', 'Render', [
			{ value: CircleModes.thick, text: 'THICK' },
			{ value: CircleModes.thin, text: 'THIN' },
			{ value: CircleModes.filled, text: 'FILL' },
		], this.mode, (mode) => {
			this.setMode(mode);

			this.triggerChange('mode');
		});

		this.widthControl = makeInputControl('Settings', 'Width', "number", this.width, () => {
			this.width = parseInt(this.widthControl.element.value, 10);
			this.height = Math.round(this.width * this.ratioHeight / this.ratioWidth);
			this.heightControl.element.value = `${this.height}`;

			this.triggerChange('width');
		});

		this.heightControl = makeInputControl('Settings', 'Height', "number", this.height, () => {
			this.height = parseInt(this.heightControl.element.value, 10);
			this.width = Math.round(this.height * this.ratioWidth / this.ratioHeight);
			this.widthControl.element.value = `${this.width}`;

			this.triggerChange('height');
		});

		this.aspectRatioControl = this.makeAspectRatioControl();

		this.maxBlocksControl = makeInputControl('Settings', 'Max Block', 'number', '', (val) => {
			const maxBlocks = parseInt(val, 10);
			if (isNaN(maxBlocks) || maxBlocks < 1) return;

			const multiplier = Circle.findLargestForMaxBlocks(maxBlocks, this.mode, this.ratioWidth, this.ratioHeight);
			if (multiplier < 1) return;

			this.width = this.ratioWidth * multiplier;
			this.height = this.ratioHeight * multiplier;
			this.widthControl.element.value = `${this.width}`;
			this.heightControl.element.value = `${this.height}`;

			this.triggerChange('maxBlocks');
		}, { min: '1' });
	}

	private makeAspectRatioControl(): Control<HTMLElement> {
		const container = document.createElement('div');
		container.className = 'aspect-ratio-control';

		const ratioWidthInput = makeInputControl('Settings', null, 'number', this.ratioWidth, (val) => {
			this.ratioWidth = Circle.clampRatio(parseInt(val, 10));
			ratioWidthInput.element.value = `${this.ratioWidth}`;

			this.height = Math.round(this.width * this.ratioHeight / this.ratioWidth);
			this.heightControl.element.value = `${this.height}`;

			this.triggerChange('ratio');
		}, { min: '1', max: '30' });

		const ratioHeightInput = makeInputControl('Settings', null, 'number', this.ratioHeight, (val) => {
			this.ratioHeight = Circle.clampRatio(parseInt(val, 10));
			ratioHeightInput.element.value = `${this.ratioHeight}`;

			this.height = Math.round(this.width * this.ratioHeight / this.ratioWidth);
			this.heightControl.element.value = `${this.height}`;

			this.triggerChange('ratio');
		}, { min: '1', max: '30' });

		container.appendChild(ratioWidthInput.container ?? ratioWidthInput.element);
		container.appendChild(ratioHeightInput.container ?? ratioHeightInput.element);

		return { element: container, label: 'Aspect Ratio', group: 'Settings' };
	}

	private static clampRatio(value: number): number {
		if (isNaN(value) || value < 1) return 1;
		if (value > 30) return 30;
		return value;
	}

	private static countBlocks(width: number, height: number, mode: CircleModes): number {
		const radius = width / 2;
		const ratio = width / height;
		let count = 0;
		for (let yi = 0; yi < height; yi++) {
			for (let xi = 0; xi < width; xi++) {
				const x = -.5 * (width - 2 * (xi + .5));
				const y = -.5 * (height - 2 * (yi + .5));
				let isFilled: boolean;
				switch (mode) {
					case CircleModes.thick:  isFilled = fatfilled(x, y, radius, ratio); break;
					case CircleModes.thin:   isFilled = thinfilled(x, y, radius, ratio); break;
					case CircleModes.filled: isFilled = filled(x, y, radius, ratio); break;
					default: throw new NeverError(mode);
				}
				if (isFilled) count++;
			}
		}
		return count;
	}

	private static findLargestForMaxBlocks(maxBlocks: number, mode: CircleModes, ratioWidth: number, ratioHeight: number): number {
		const maxDimension = 500;
		let low = 1, high = Math.max(1, Math.floor(maxDimension / Math.max(ratioWidth, ratioHeight))), result = 0;
		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			if (Circle.countBlocks(ratioWidth * mid, ratioHeight * mid, mode) <= maxBlocks) {
				result = mid;
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		}
		return result;
	}

	private triggerChange(event: string): void {
		this.changeEmitter.trigger({
			event,
			state: {
				mode: this.mode,
				width: this.width,
				height: this.height,
				ratioWidth: this.ratioWidth,
				ratioHeight: this.ratioHeight,
			}
		});
	}

	public getControls(): Control[] {
		return [
			this.maxBlocksControl,
			this.aspectRatioControl,
			this.widthControl,
			this.heightControl,
			this.modeControl,
		];
	}

	private setMode(mode: CircleModes): void {
		this.mode = mode;
	}

	public getBounds(): Bounds {
		return {
			minX: 0,
			maxX: this.width,

			minY: 0,
			maxY: this.height,
		};
	}

	public isFilled(x: number, y: number): boolean {
		const bounds = this.getBounds();

		x = -.5 * (bounds.maxX - 2 * (x + .5));
		y = -.5 * (bounds.maxY - 2 * (y + .5));

		switch (this.mode) {
			case CircleModes.thick: {
				return fatfilled(x, y, (bounds.maxX / 2), bounds.maxX / bounds.maxY);
			}
			case CircleModes.thin: {
				return thinfilled(x, y, (bounds.maxX / 2), bounds.maxX / bounds.maxY);
			}
			case CircleModes.filled: {
				return filled(x, y, (bounds.maxX / 2), bounds.maxX / bounds.maxY);
			}
			default: {
				throw new NeverError(this.mode);
			}
		}
	}

	public getDescription(): string {
		return `Circle-${this.width}x${this.height}`;
	}

}
