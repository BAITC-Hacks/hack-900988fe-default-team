import { createHttpAdapter } from './httpAdapter';
import { mockAdapter } from './mockAdapter';

const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const apiAdapter = baseUrl ? createHttpAdapter(baseUrl) : mockAdapter;
export const apiMode = baseUrl ? 'api' : 'mock';
