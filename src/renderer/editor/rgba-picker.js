/**
 * カスタムエレメント <rgba-picker> の定義
 * 外部のCSSやJSの影響を受けないようShadow DOMでカプセル化されています。
 */
class RgbaPickerElement extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        const labelText = this.getAttribute('label') || 'Color';
        const initialValue = this.getAttribute('value') || 'rgba(0,0,0,1)';

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    font-family: sans-serif;
                }
                .container {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 8px 0;
                    border-bottom: 1px solid #eee;
                }
                label {
                    width: 90px;
                    font-size: 14px;
                    font-weight: bold;
                    color: #333;
                }
                input[type="color"] {
                    cursor: pointer;
                    width: 40px;
                    height: 30px;
                    border: none;
                    padding: 0;
                    background: none;
                }
                input[type="range"] {
                    flex-grow: 1;
                    cursor: pointer;
                }
                .alpha-label {
                    font-size: 13px;
                    width: 45px;
                    text-align: right;
                    font-family: monospace;
                    color: #555;
                }
            </style>
            <div class="container">
                <label>${labelText}</label>
                <input type="color" id="color-input">
                <input type="range" id="alpha-input" min="0" max="1" step="0.01">
                <span id="alpha-label" class="alpha-label">100%</span>
            </div>
        `;

        this.colorInput = this.shadowRoot.getElementById('color-input');
        this.alphaInput = this.shadowRoot.getElementById('alpha-input');
        this.alphaLabel = this.shadowRoot.getElementById('alpha-label');

        this.colorInput.addEventListener('input', () => this.dispatchChange());
        this.alphaInput.addEventListener('input', () => this.dispatchChange());

        // 初期値のセット
        this.setValue(initialValue);
    }

    // RGBA文字列からHEXとAlphaを抽出してUIに反映
    setValue(rgbaString) {
        const match = rgbaString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!match) return;

        const r = parseInt(match[1], 10);
        const g = parseInt(match[2], 10);
        const b = parseInt(match[3], 10);
        const a = match[4] !== undefined ? parseFloat(match[4]) : 1.0;

        const hex = "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
        
        this.colorInput.value = hex;
        this.alphaInput.value = a;
        this.alphaLabel.textContent = Math.round(a * 100) + '%';
        this.setAttribute('value', rgbaString);
    }

    // 値が変更された際にカスタムイベントを発行
    dispatchChange() {
        const hex = this.colorInput.value.replace('#', '');
        const alpha = this.alphaInput.value;
        this.alphaLabel.textContent = Math.round(alpha * 100) + '%';

        const bigint = parseInt(hex, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;

        const rgba = `rgba(${r}, ${g}, ${b}, ${alpha})`;

        this.setAttribute('value', rgba);

        this.dispatchEvent(new CustomEvent('rgba-change', {
            detail: { rgba: rgba }
        }));
    }
}

customElements.define('rgba-picker', RgbaPickerElement);