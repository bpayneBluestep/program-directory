/* =====================================================================
   ContactsEditor.tsx — a structured editor over the program's contacts
   (rows of name / role / phone / email). Never a raw JSON textarea; the
   parent serializes the rows to JSON on save.
   ===================================================================== */

import type { Contact } from './api';
import { Icon } from './ui';

interface Props {
  contacts: Contact[];
  onChange: (next: Contact[]) => void;
  disabled?: boolean;
}

const BLANK: Contact = { name: '', role: '', phone: '', email: '' };

export default function ContactsEditor({ contacts, onChange, disabled }: Props) {
  function update(index: number, patch: Partial<Contact>) {
    onChange(contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }
  function remove(index: number) {
    onChange(contacts.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...contacts, { ...BLANK }]);
  }

  return (
    <div className="contacts">
      {contacts.length === 0 ? (
        <p className="contacts-empty">
          No contacts yet. Add the people a referring family or professional should reach.
        </p>
      ) : (
        <ul className="contacts-list">
          {contacts.map((c, i) => (
            <li className="contact-row" key={i}>
              <div className="contact-grid">
                <label className="field field-sm">
                  <span className="field-label">Name</span>
                  <input
                    className="input"
                    type="text"
                    value={c.name || ''}
                    placeholder="Jordan Ellis"
                    onChange={(e) => update(i, { name: e.target.value })}
                    disabled={disabled}
                  />
                </label>
                <label className="field field-sm">
                  <span className="field-label">Role</span>
                  <input
                    className="input"
                    type="text"
                    value={c.role || ''}
                    placeholder="Admissions Director"
                    onChange={(e) => update(i, { role: e.target.value })}
                    disabled={disabled}
                  />
                </label>
                <label className="field field-sm">
                  <span className="field-label">Phone</span>
                  <input
                    className="input"
                    type="tel"
                    value={c.phone || ''}
                    placeholder="(555) 010-1234"
                    onChange={(e) => update(i, { phone: e.target.value })}
                    disabled={disabled}
                  />
                </label>
                <label className="field field-sm">
                  <span className="field-label">Email</span>
                  <input
                    className="input"
                    type="email"
                    value={c.email || ''}
                    placeholder="admissions@program.org"
                    onChange={(e) => update(i, { email: e.target.value })}
                    disabled={disabled}
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon contact-remove"
                onClick={() => remove(i)}
                disabled={disabled}
                aria-label={`Remove ${c.name ? c.name : `contact ${i + 1}`}`}
              >
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="btn btn-soft" onClick={add} disabled={disabled}>
        <Icon name="plus" size={16} />
        Add contact
      </button>
    </div>
  );
}
