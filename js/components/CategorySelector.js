import { esc, html } from '../utils.js';

/** Generic radio-card group. options: [{ id, name, icon, detail, disabled }] */
export function OptionGroup({ name, legend, options, selectedId, onChange, className = '' }) {
  const element = html(`
    <fieldset class="option-group ${className}">
      <legend class="step-title">${esc(legend)}</legend>
      <div class="option-grid">
        ${options.map((o) => `
          <label class="option-card ${o.disabled ? 'is-disabled' : ''}">
            <input type="radio" name="${name}" value="${esc(o.id)}" ${o.id === selectedId ? 'checked' : ''} ${o.disabled ? 'disabled' : ''}>
            <span class="option-inner">
              ${o.icon ? `<span class="option-icon" aria-hidden="true">${o.icon}</span>` : ''}
              <span class="option-name">${esc(o.name)}</span>
              ${o.detail ? `<span class="option-detail">${esc(o.detail)}</span>` : ''}
            </span>
          </label>`).join('')}
      </div>
    </fieldset>`);
  element.addEventListener('change', (e) => onChange(e.target.value));
  return element;
}

/** Categories come pre-filtered (only those with enough songs), each with a `count`. */
export function CategorySelector({ categories, selectedId, onChange }) {
  return OptionGroup({
    name: 'category',
    legend: '2 · Pick a category',
    className: 'categories',
    selectedId,
    onChange,
    options: categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, detail: `${c.count} songs` })),
  });
}
