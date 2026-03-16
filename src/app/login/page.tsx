import LoginPageClient from './LoginPageClient';

type LoginSearchParams = {
    error?: string | string[];
    message?: string | string[];
};

function firstParam(value?: string | string[]): string | undefined {
    if (Array.isArray(value)) return value[0];
    return value;
}

function getInitialAuthError(searchParams: LoginSearchParams): string {
    const message = firstParam(searchParams.message);
    if (message) return message;
    const error = firstParam(searchParams.error);
    if (error) return `Authentication failed (${error})`;
    return '';
}

export default function LoginPage({
    searchParams = {},
}: {
    searchParams?: LoginSearchParams;
}) {
    const initialCallbackErrorMessage = getInitialAuthError(searchParams);
    return <LoginPageClient initialCallbackErrorMessage={initialCallbackErrorMessage} />;
}
