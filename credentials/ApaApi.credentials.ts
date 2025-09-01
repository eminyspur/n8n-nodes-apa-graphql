import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ApaApi implements ICredentialType {
	name = 'apaApi';
	displayName = 'APA API';
	documentationUrl = 'https://gql.poolplayers.com/graphql';
	properties: INodeProperties[] = [
		{
			displayName: 'Email',
			name: 'email',
			type: 'string',
			placeholder: 'user@example.com',
			default: '',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
		},
	];
}