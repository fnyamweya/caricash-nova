import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotFoundPage } from './not-found-page.js';

describe('NotFoundPage', () => {
    it('renders stable markup snapshot', () => {
        const html = renderToStaticMarkup(
            React.createElement(NotFoundPage, {
                title: 'Missing route',
                description: 'No route matched this URL.',
                homeHref: '/dashboard',
                homeLabel: 'Go to dashboard',
            }),
        );

        expect(html).toMatchSnapshot();
    });
});
