export class KeypadUI {
  constructor({ onSubmit, onCancel } = {}) {
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
    this.value = '';
    this.isOpen = false;

    this.root = this.build();
    this.displaySlots = [...this.root.querySelectorAll('.keypad-slot')];
    this.status = this.root.querySelector('.keypad-status');
    this.enterButton = this.root.querySelector('[data-action="enter"]');

    this.onKeyDown = (event) => this.handleKeyDown(event);
    window.addEventListener('keydown', this.onKeyDown);

    this.updateDisplay();
  }

  build() {
    const root = document.createElement('div');
    root.id = 'keypad-overlay';
    root.className = 'keypad-overlay';
    root.setAttribute('aria-hidden', 'true');

    root.innerHTML = `
      <div
        class="keypad-device"
        role="dialog"
        aria-modal="true"
        aria-label="Six digit security keypad"
      >
        <div class="keypad-header">
          <div>
            <div class="keypad-brand">ACCESS</div>
            <div class="keypad-instruction">
              ENTER 6-DIGIT ACCESS CODE
            </div>
          </div>

          <button
            class="keypad-close"
            type="button"
            data-action="cancel"
            aria-label="Leave keypad"
          >
            ESC
          </button>
        </div>

        <div class="keypad-display" aria-live="polite">
          <div class="keypad-slots" aria-label="Code entry">
            ${Array.from(
              { length: 6 },
              (_, index) =>
                `<span class="keypad-slot" data-slot="${index}"></span>`
            ).join('')}
          </div>

          <div class="keypad-status">
            6 DIGITS REQUIRED
          </div>
        </div>

        <div class="keypad-grid">
          ${[1,2,3,4,5,6,7,8,9]
            .map(
              (digit) =>
                `<button
                  type="button"
                  class="keypad-key"
                  data-digit="${digit}"
                >
                  ${digit}
                </button>`
            )
            .join('')}

          <button
            type="button"
            class="keypad-key keypad-key-secondary"
            data-action="clear"
          >
            CLR
          </button>

          <button
            type="button"
            class="keypad-key"
            data-digit="0"
          >
            0
          </button>

          <button
            type="button"
            class="keypad-key keypad-key-enter"
            data-action="enter"
            disabled
          >
            ENT
          </button>
        </div>

        <div class="keypad-footer">
          NUMBERS / BACKSPACE / ENTER
          &nbsp;•&nbsp;
          ESC TO LEAVE
        </div>
      </div>
    `;

    root.addEventListener('click', (event) => {
      const button = event.target.closest('button');

      if (!button) return;

      const digit = button.dataset.digit;
      const action = button.dataset.action;

      if (digit !== undefined) {
        this.addDigit(digit);
      } else if (action === 'clear') {
        this.clear();
      } else if (action === 'enter') {
        this.submit();
      } else if (action === 'cancel') {
        this.cancel();
      }
    });

    //document.getElementById('ui-layer')?.appendChild(root);
    const uiLayer = document.getElementById('ui-layer');

    if (!uiLayer) {
    throw new Error('KeypadUI requires #ui-layer');
    }

    uiLayer.appendChild(root);

    return root;
  }

  open() {
    this.value = '';
    this.isOpen = true;

    this.root.classList.add('visible');
    this.root.setAttribute('aria-hidden', 'false');

    this.setStatus('6 DIGITS REQUIRED');

    this.updateDisplay();
  }

  close() {
    this.isOpen = false;

    this.root.classList.remove('visible');
    this.root.setAttribute('aria-hidden', 'true');
  }

  handleKeyDown(event) {
    if (!this.isOpen) return;

    event.stopPropagation();

    if (/^Digit[0-9]$/.test(event.code)) {
      event.preventDefault();
      this.addDigit(event.code.slice(-1));
      return;
    }

    if (/^Numpad[0-9]$/.test(event.code)) {
      event.preventDefault();
      this.addDigit(event.code.slice(-1));
      return;
    }

    if (
      event.code === 'Backspace' ||
      event.code === 'Delete'
    ) {
      event.preventDefault();
      this.backspace();
      return;
    }

    if (
      event.code === 'Enter' ||
      event.code === 'NumpadEnter'
    ) {
      event.preventDefault();
      this.submit();
      return;
    }

    // if (event.code === 'Escape') {
    //   event.preventDefault();
    //   this.cancel();
    // }
  }

  addDigit(digit) {
    if (this.value.length >= 6) return;

    this.value += digit;

    this.setStatus(
      this.value.length === 6
        ? 'READY — PRESS ENTER'
        : `${6 - this.value.length} DIGIT${
            6 - this.value.length === 1 ? '' : 'S'
          } REMAINING`
    );

    this.updateDisplay();
  }

  backspace() {
    if (!this.value.length) return;

    this.value = this.value.slice(0, -1);

    this.setStatus(
      this.value.length
        ? `${6 - this.value.length} DIGIT${
            6 - this.value.length === 1 ? '' : 'S'
          } REMAINING`
        : '6 DIGITS REQUIRED'
    );

    this.updateDisplay();
  }

  clear() {
    this.value = '';

    this.setStatus('CLEARED — 6 DIGITS REQUIRED');

    this.updateDisplay();
  }

  submit() {
    if (this.value.length !== 6) {
      this.setStatus(
        'ACCESS CODE MUST BE 6 DIGITS',
        'error'
      );

      this.root
        .querySelector('.keypad-device')
        ?.classList.remove('shake');

      void this.root.offsetWidth;

      this.root
        .querySelector('.keypad-device')
        ?.classList.add('shake');

      return;
    }

    const code = this.value;

    this.setStatus('CODE RECEIVED', 'success');

    this.onSubmit?.(code);
  }

  cancel() {
    this.onCancel?.();
  }

  setStatus(message, type = 'normal') {
    this.status.textContent = message;
    this.status.dataset.state = type;
  }

  updateDisplay() {
    this.displaySlots.forEach((slot, index) => {
      const filled = index < this.value.length;

      slot.classList.toggle('filled', filled);

      slot.textContent = filled ? this.value[index] : '';
    });

    this.enterButton.disabled =
      this.value.length !== 6;
  }
}