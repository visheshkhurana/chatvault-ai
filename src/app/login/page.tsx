import LoginPageClient from './LoginPageClient';

type LoginPageProps = {
    searchParams?: {
        error?: string | string[];
        message?: string | string[];
    };
};

function getFirstValue(value?: string | string[]) {
    return Array.isArray(value) ? value[0] : value;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
    const callbackError = getFirstValue(searchParams?.error);
    const callbackMessage = getFirstValue(searchParams?.message);

    return (
        <LoginPageClient
            initialError={callbackError ? callbackMessage || 'Authentication failed. Please try again.' : ''}
            initialMessage={callbackError ? '' : callbackMessage || ''}
        />
    );
}
