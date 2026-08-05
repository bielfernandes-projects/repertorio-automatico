import { describe, expect, it } from 'vitest';
import { songDocsFingerprint } from './ids';
import { CatalogSong } from '../types';

function makeSong(docs: CatalogSong['documents']): CatalogSong {
  return {
    id: 'song_1',
    userId: 'user_1',
    name: 'Teste',
    artist: 'Artista',
    originalKey: 'C',
    documents: docs,
    createdAt: '',
    updatedAt: ''
  };
}

const doc = {
  id: 'doc_1',
  name: 'partitura.pdf',
  type: 'pdf' as const,
  dataUrl: 'data:application/pdf;base64,AAAA',
  fileSize: 123,
  createdAt: '2026-01-01T00:00:00Z'
};

describe('songDocsFingerprint', () => {
  it('é determinístico para o mesmo conjunto de documentos', () => {
    const a = songDocsFingerprint(makeSong([doc]));
    const b = songDocsFingerprint(makeSong([doc]));
    expect(a).toBe(b);
  });

  it('é igual para ordem de documentos diferente', () => {
    const doc2 = { ...doc, id: 'doc_2', name: 'imagem.png' };
    const a = songDocsFingerprint(makeSong([doc, doc2]));
    const b = songDocsFingerprint(makeSong([doc2, doc]));
    expect(a).toBe(b);
  });

  it('ignora o dataUrl (payload base64) — só metadados contam', () => {
    const changedContent = { ...doc, dataUrl: 'data:application/pdf;base64,BBBB' };
    const a = songDocsFingerprint(makeSong([doc]));
    const b = songDocsFingerprint(makeSong([changedContent]));
    expect(a).toBe(b);
  });

  it('muda quando um documento é adicionado ou removido', () => {
    const doc2 = { ...doc, id: 'doc_2' };
    const one = songDocsFingerprint(makeSong([doc]));
    const two = songDocsFingerprint(makeSong([doc, doc2]));
    expect(one).not.toBe(two);
  });
});
