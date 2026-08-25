import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { MedicalkaPartnerDialog } from './MedicalkaPartnerDialog';

const summary = {
  activeEnvironment: 'production',
  profiles: [
    {
      environment: 'production', baseUrl: 'https://api.medicalka.com/api/v1',
      username: 'fa••••od', passwordConfigured: true, processingMode: 'observe',
      active: true, pharmacyCount: 2, pharmacies: [{ id: 'p-1', name: 'Fairhaven' }],
      lastValidatedAt: '2026-08-25T08:00:00.000Z', health: { lastErrorCode: '' },
    },
    {
      environment: 'staging', baseUrl: 'https://api.staging.medicalka.com/api/v1',
      username: 'fa••••ng', passwordConfigured: true, processingMode: 'observe',
      active: false, pharmacyCount: 1, pharmacies: [], health: { lastErrorCode: '' },
    },
  ],
};

function makeApi() {
  return {
    saveMedicalkaPartner: vi.fn().mockResolvedValue({ data: summary.profiles[0] }),
    activateMedicalkaPartner: vi.fn().mockResolvedValue({ data: summary }),
  };
}

it('shows fixed environments, masked summary and write-only password', async () => {
  render(<MedicalkaPartnerDialog open api={makeApi()} summary={summary} onClose={() => {}} />);

  expect(screen.getByText('fa••••od')).toBeInTheDocument();
  expect(screen.getByText('https://api.medicalka.com/api/v1')).toBeInTheDocument();
  expect(screen.getByLabelText('Новый пароль')).toHaveValue('');
  expect(screen.queryByLabelText(/URL/i)).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('radio', { name: /Staging/ }));
  expect(screen.getByText('https://api.staging.medicalka.com/api/v1')).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /Live/ })).not.toBeInTheDocument();
});

it('validates and saves while blank password preserves configured secret', async () => {
  const api = makeApi();
  render(<MedicalkaPartnerDialog open api={api} summary={summary} onClose={() => {}} />);

  await userEvent.type(screen.getByLabelText('Новый логин'), 'replacement-user');
  await userEvent.click(screen.getByRole('button', { name: 'Проверить и сохранить' }));

  expect(api.saveMedicalkaPartner).toHaveBeenCalledWith('production', {
    username: 'replacement-user', password: '', processingMode: 'observe',
  });
  expect(await screen.findByText(/Связь проверена/)).toBeInTheDocument();
});

it('production live mode requires explicit Billz confirmation', async () => {
  const api = makeApi();
  render(<MedicalkaPartnerDialog open api={api} summary={summary} onClose={() => {}} />);

  await userEvent.selectOptions(screen.getByLabelText('Режим обработки'), 'live');
  expect(screen.getByRole('button', { name: 'Проверить и сохранить' })).toBeDisabled();
  expect(screen.getByText(/списание в Billz/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('checkbox', { name: /понимаю/ }));
  expect(screen.getByRole('button', { name: 'Проверить и сохранить' })).toBeEnabled();
});

it('configured inactive environment can be activated separately', async () => {
  const api = makeApi();
  render(<MedicalkaPartnerDialog open api={api} summary={summary} onClose={() => {}} />);

  await userEvent.click(screen.getByRole('radio', { name: /Staging/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Сделать активным' }));

  expect(api.activateMedicalkaPartner).toHaveBeenCalledWith('staging');
});
