# Firebase Authentication Email Templates Setup

Follow these steps to fix the password reset email template in Firebase:

## Step 1: Access Firebase Console

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select the "funkhaus-sports" project

## Step 2: Configure Authentication Templates

1. In the left navigation menu, click on "Authentication"
2. Click on the "Templates" tab
3. Select "Password reset" from the template list

## Step 3: Customize Email Template

1. Update the "Sender name" field to: `Funkhaus Sports`
2. Update the "Subject" field to: `Reset your password for Funkhaus Sports`
3. For the email body, replace the content with:

```html
<p>Hello,</p>
<p>Follow this link to reset your Funkhaus Sports password for your account: {{ email }}</p>
<p><a href="{{ link }}">{{ link }}</a></p>
<p>If you didn't ask to reset your password, you can ignore this email.</p>
<p>Thanks,<br>
The Funkhaus Sports Team</p>
```

4. Click "Save" to apply changes

## Step 4: Test the Password Reset Flow

1. Go to your login page
2. Click on "Forgot Password"
3. Enter your email and submit
4. Check your email for the reset link
5. Verify that the email displays correctly with proper formatting and branding

## Additional Notes

- The Firebase Authentication email templates use a different placeholder syntax than the emulator
- For production: `{{ email }}` and `{{ link }}`
- For emulator: `{user.email}` and `{resetLink}`