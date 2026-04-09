=============
  To set up 
=============


1) first create environemnt to prevent global conflict of dependencies
    in parent folder "NTERAVTIVE-MAP" run terminal 
    enter in terminal "python -m venv <venv>" dont include '< >' these are used to indicate a modifiable field, venv is the defualt best practice name for venv (virtual environment folders), but you can name it whatever you like.
            alt "py -m venv <venv>"

2) to start environment  
    in parent folder "NTERAVTIVE-MAP" run terminal 
    enter in terminal "venv/scripts/activate"
    you should see green font (venv)in your terminal on the command line now

3) downlaod dependencies in environment NOTE* 
    with environment running from step 2
    enter in terminal "python -m pip install -r requirements.txt"
                alt "py -m pip install -r requirements.txt"

4) start app
    following step 3, in terminal run "python app.py"
                            alt   "py app.py"

5) close app 
    you cannot interactive enter text in terminal at this stage
    so push ctr + c on keyboard after clicking terminal
    now you can enter text 
    in terminal enter "deactivate" 
    instance is now closed, the green '(venv)' should be gone

============
 git stuff
============

1) set up repository


2) update remoe repository with your local changes 
    git add .                                   will add all saved files
    git commin -m "<description of changes>"       adds msg for logs
    git push                                       pushes the change

3)
