"""
Intentionally vulnerable sample file — for demonstrating the security evaluator.
DO NOT use any of these patterns in production code.
"""
import os
import pickle
import hashlib
import subprocess
import sqlite3

# SEC020: Hardcoded credential
DB_PASSWORD = "s3cr3t_passw0rd"
API_KEY = "sk-abcdef1234567890abcdef"

# SEC023: Private key material
PRIVATE_KEY = """-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4V7...
-----END RSA PRIVATE KEY-----"""


def run_user_command(user_input: str):
    # SEC001: eval of user input
    result = eval(user_input)  # noqa

    # SEC010: os.system with user input
    os.system("echo " + user_input)

    # SEC040: shell=True
    subprocess.run(user_input, shell=True)

    return result


def load_user_data(data: bytes):
    # SEC005: unsafe pickle deserialization
    return pickle.loads(data)


def hash_password(password: str) -> str:
    # SEC030: MD5 is broken for passwords
    return hashlib.md5(password.encode()).hexdigest()


def get_user(conn: sqlite3.Connection, username: str):
    cursor = conn.cursor()
    # SEC060: SQL injection via string formatting
    cursor.execute("SELECT * FROM users WHERE name = '%s'" % username)
    return cursor.fetchone()


def check_admin(user):
    # SEC050: assert stripped by -O
    assert user["role"] == "admin", "Not admin"
    return True
