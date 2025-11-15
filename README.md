# T99W175-simpleadmin

This fork is specific for connetting via ssh to a mikrotik router and retreive connection info from that 


The remote_admin_embedded.py is a standalone file with inside a zip folder containing simpleadmin_assets with all the files needed for the gui to work , once launched these file will be put inside the temp folder , so no permission or weird problem arise , the extracted file are on the folder simpleadmin_assets , the extract.py script extract the data from remote_admin_embedded.py and the build.py builds the B64 encoded data for the standalone script.
