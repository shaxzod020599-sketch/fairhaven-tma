import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MedicalkaWizard } from './MedicalkaWizard';

describe('MedicalkaWizard', () => {
  it('explains, confirms, reveals both keys, then requires acknowledgement', async () => {
    const issuePair = vi.fn().mockResolvedValue({ data: { token: 'fhm_t_demo', secret: 'fhm_s_demo' } });
    const close = vi.fn();
    render(<MedicalkaWizard open api={{ issuePair }} onClose={close} onDone={() => {}} />);

    expect(screen.getByRole('heading', { name: /два ключа/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(issuePair).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Создать два ключа' }));

    expect(await screen.findByDisplayValue('fhm_t_demo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('fhm_s_demo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть мастер' })).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: /скопировал/ }));
    expect(screen.getByRole('button', { name: 'Закрыть мастер' })).toBeEnabled();
  });
});
