import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExcelDialog } from './ExcelDialog';

describe('ExcelDialog', () => {
  it('previews workbook changes before enabling apply', async () => {
    const api = {
      importExcel: vi.fn().mockResolvedValue({
        data: { report: { toCreate: [{ row: 2 }], toUpdate: [{ _id: 'p1' }], invalid: [], unchangedCount: 3 }, applied: false },
      }),
    };
    render(<ExcelDialog open api={api} onClose={() => {}} onApplied={() => {}} />);

    const file = new File(['workbook'], 'products.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    fireEvent.change(screen.getByLabelText('Файл Excel'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить без изменений' }));

    expect(api.importExcel).toHaveBeenCalledWith(file, false);
    expect(await screen.findByText('1 создать')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Применить изменения' })).toBeEnabled();
  });
});
