import { readEmailReturn,incomingEmailReturn } from './email-confirmation';
export const passwordResetUrl = (origin = window.location.origin) => new URL('/auth/reset',origin).href;
export function readPasswordReturn(href:string) {
  const url=new URL(href),fragment=new URLSearchParams(url.hash.slice(1));
  return {...readEmailReturn(href),implicit:fragment.get('type')==='recovery'&&Boolean(fragment.get('access_token'))||Boolean(incomingEmailReturn?.hasRecoveryToken)};
}
export const incomingPasswordReturn=typeof window==='undefined'?null:{...readPasswordReturn(window.location.href),...incomingEmailReturn};
export function passwordResetError(cause:unknown) {
 const code=cause&&typeof cause==='object'&&'code' in cause?String(cause.code):'';
 if(['otp_expired','access_denied','flow_state_expired','flow_state_not_found','bad_code_verifier','code_verifier_not_found'].includes(code))return 'This reset link has expired, was already used, or cannot be opened in this browser. Request a new password-reset email.';
 if(code==='same_password')return 'Choose a password different from your current password.';
 if(code==='weak_password')return 'Choose a stronger password with at least 8 characters.';
 if(code.includes('rate_limit'))return 'Too many reset requests. Please wait before trying again.';
 return cause&&typeof cause==='object'&&'message' in cause?String(cause.message):'The password reset could not be completed. Please try again.';
}
interface ResetClient {auth:{getSession():Promise<{data:{session:unknown};error:unknown}>;getUser():Promise<{data:{user:{id:string}|null};error:unknown}>;verifyOtp(input:{token_hash:string;type:'recovery'}):Promise<{data:{session:unknown};error:unknown}>;exchangeCodeForSession(code:string):Promise<{data:{session:unknown};error:unknown}>}}
export async function completePasswordReturn(client:ResetClient,incoming:ReturnType<typeof readPasswordReturn>) {
 if(incoming.errorCode)throw {code:incoming.errorCode,message:'This reset link could not be opened. Request a new password-reset email.'};
 if(incoming.type&&incoming.type!=='recovery')throw new Error('Use the link from your password-reset email.');
 if(!incoming.tokenHash&&!incoming.code&&!incoming.implicit)throw new Error('Open the link from your password-reset email to choose a new password.');
 let result=await client.auth.getSession();if(result.error)throw result.error;
 if(incoming.tokenHash){if(incoming.type!=='recovery')throw new Error('Use the link from your password-reset email.');result=await client.auth.verifyOtp({token_hash:incoming.tokenHash,type:'recovery'});}
 else if(incoming.code)result=await client.auth.exchangeCodeForSession(incoming.code);
 if(result.error)throw result.error;if(!result.data.session)throw new Error('This reset link could not sign you in. Request a new password-reset email.');
 const identity=await client.auth.getUser();if(identity.error)throw identity.error;if(!identity.data.user)throw new Error('Your reset session could not be verified. Request a new reset email.');return identity.data.user.id;
}
